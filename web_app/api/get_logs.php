<?php
// The signed-in rider's own crash / false-alarm history for the Incident Map.
require_once __DIR__ . '/lib/bootstrap.php';
$rider = require_role($conn, 'rider');
$logs = db_all($conn, "SELECT id, status, tilt_angle, roll_angle, pitch_angle, latitude, longitude, speed_kmh, nearest_hospital, timestamp
                       FROM accident_logs WHERE user_id = ? ORDER BY id DESC LIMIT 50", [(int) $rider['id']]);
json_out(["status" => "success", "count" => count($logs), "data" => $logs]);
