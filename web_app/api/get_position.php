<?php
// The signed-in rider's own last live position.
require_once __DIR__ . '/lib/bootstrap.php';
$rider = require_role($conn, 'rider');
$row = db_one($conn, "SELECT latitude, longitude, speed_kmh, status, updated_at FROM rider_live WHERE user_id = ?", [(int) $rider['id']]);
if ($row) $row['seconds_ago'] = max(0, time() - strtotime($row['updated_at']));
json_out(["status" => "success", "data" => $row]);
