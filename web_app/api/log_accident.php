<?php
// Records every crash / false alarm from the rider app in accident_logs (the
// permanent audit trail). A CONFIRMED_CRASH also opens a dispatch incident
// with the signed-in rider's medical profile and alerts the three nearest
// hospitals. The rider token is optional: an SOS must never fail just
// because the rider's session expired.
require_once __DIR__ . '/lib/bootstrap.php';

$input = read_json();

$status = str_in($input, 'status', 50) ?: 'CONFIRMED_CRASH';
$tilt = (float) ($input['tilt_angle'] ?? 0);
$roll = (float) ($input['roll_angle'] ?? 0);
$pitch = (float) ($input['pitch_angle'] ?? 0);
$lat = isset($input['latitude']) && $input['latitude'] !== null ? (float) $input['latitude'] : null;
$lon = isset($input['longitude']) && $input['longitude'] !== null ? (float) $input['longitude'] : null;
$speed = (float) ($input['speed_kmh'] ?? 0);
$nearest = str_in($input, 'nearest_hospital', 255) ?: 'Not Specified';

db_exec($conn, "INSERT INTO accident_logs (status, tilt_angle, roll_angle, pitch_angle, latitude, longitude, speed_kmh, nearest_hospital, timestamp)
                VALUES (?,?,?,?,?,?,?,?,?)",
    [$status, $tilt, $roll, $pitch, $lat, $lon, $speed, $nearest, now_ts()]);
$logId = $conn->insert_id;

$response = ["status" => "success", "message" => "Log saved successfully", "log_id" => $logId];

if ($status === 'CONFIRMED_CRASH' && $lat !== null && $lon !== null) {
    $rider = current_user($conn);
    $incidentId = create_incident($conn, [
        "accident_log_id" => $logId,
        "rider_user_id" => $rider && $rider['role'] === 'rider' ? $rider['id'] : null,
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
