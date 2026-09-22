<?php
// Records every crash / false alarm from the signed-in rider in
// accident_logs (the permanent audit trail). A CONFIRMED_CRASH also opens
// a dispatch incident with the rider's medical profile and alerts the
// three nearest verified hospitals.
require_once __DIR__ . '/lib/bootstrap.php';
require_post();

$rider = require_role($conn, 'rider');
$uid = (int) $rider['id'];
$input = read_json();

$status = str_in($input, 'status', 50);
if (!in_array($status, ['CONFIRMED_CRASH', 'CANCELED_FALSE_ALARM'], true)) fail("Unknown status.");
rate_limit($conn, "log:$uid", 20, 600, "Too many crash reports in a short time.");

$num = fn($k, $min, $max) => isset($input[$k]) && is_numeric($input[$k]) ? max($min, min($max, (float) $input[$k])) : null;
$tilt = $num('tilt_angle', -360, 360) ?? 0.0;
$roll = $num('roll_angle', -360, 360) ?? 0.0;
$pitch = $num('pitch_angle', -360, 360) ?? 0.0;
$lat = $num('latitude', -90, 90);
$lon = $num('longitude', -180, 180);
$speed = $num('speed_kmh', 0, 300) ?? 0.0;
$nearest = str_in($input, 'nearest_hospital', 255) ?: 'Not Specified';

db_exec($conn, "INSERT INTO accident_logs (user_id, status, tilt_angle, roll_angle, pitch_angle, latitude, longitude, speed_kmh, nearest_hospital, timestamp)
                VALUES (?,?,?,?,?,?,?,?,?,?)",
    [$uid, $status, $tilt, $roll, $pitch, $lat, $lon, $speed, $nearest, now_ts()]);
$logId = $conn->insert_id;

$response = ["status" => "success", "log_id" => $logId];

if ($status === 'CONFIRMED_CRASH' && valid_coords($lat, $lon)) {
    // One open emergency per rider at a time; a second report while help is
    // already coming reuses it instead of re-alerting every hospital.
    $open = db_one($conn, "SELECT id FROM incidents WHERE rider_user_id = ? AND status NOT IN ('ADMITTED', 'CANCELLED') AND created_at > ? ORDER BY id DESC LIMIT 1",
        [$uid, ts_ago(3600)]);
    $incidentId = $open ? (int) $open['id'] : create_incident($conn, [
        "accident_log_id" => $logId,
        "rider_user_id" => $uid,
        "location_name" => str_in($input, 'location_name', 255) ?: null,
        "latitude" => $lat, "longitude" => $lon,
        "speed_kmh" => $speed, "tilt_angle" => $tilt, "roll_angle" => $roll, "pitch_angle" => $pitch,
        "impact_g" => str_in($input, 'impact_g', 60) ?: null,
    ]);
    $response["incident_id"] = $incidentId;
    $response["alerted_hospitals"] = array_map(fn($a) => ["name" => $a['short_name'], "distance_km" => (float) $a['distance_km']],
        db_all($conn, "SELECT h.short_name, a.distance_km FROM incident_alerts a JOIN hospitals h ON h.id = a.hospital_id
                       WHERE a.incident_id = ? ORDER BY a.alert_rank", [$incidentId]));
}

json_out($response);
