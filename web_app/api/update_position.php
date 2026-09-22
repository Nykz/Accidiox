<?php
// Live heartbeat from the rider app while GPS is active.
require_once __DIR__ . '/lib/bootstrap.php';
require_post();
$rider = require_role($conn, 'rider');
$uid = (int) $rider['id'];
rate_limit($conn, "pos:$uid", 40, 60, "Too many position updates.");
$in = read_json();
$lat = isset($in['latitude']) && is_numeric($in['latitude']) ? (float) $in['latitude'] : null;
$lon = isset($in['longitude']) && is_numeric($in['longitude']) ? (float) $in['longitude'] : null;
if (!valid_coords($lat, $lon)) fail("latitude and longitude are required");
$speed = isset($in['speed_kmh']) && is_numeric($in['speed_kmh']) ? max(0, min(300, (float) $in['speed_kmh'])) : 0.0;
$status = in_array($in['status'] ?? '', ['SAFE', 'CRASH', 'CRASH_DETECTED', 'SOS'], true) ? $in['status'] : 'SAFE';
db_exec($conn, "INSERT INTO rider_live (user_id, latitude, longitude, speed_kmh, status, updated_at) VALUES (?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), speed_kmh = VALUES(speed_kmh),
                status = VALUES(status), updated_at = VALUES(updated_at)",
    [$uid, $lat, $lon, $speed, $status, now_ts()]);
json_out(["status" => "success"]);
