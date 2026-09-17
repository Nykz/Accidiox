<?php
require_once 'db_config.php';

// One bike, one row (id=1) — this is the rider app's heartbeat, called
// every few seconds while GPS is active, so the admin portal can show a
// truly live position instead of only past incidents.
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    $input = $_POST;
}

$latitude  = isset($input['latitude']) ? floatval($input['latitude']) : null;
$longitude = isset($input['longitude']) ? floatval($input['longitude']) : null;
$speed_kmh = isset($input['speed_kmh']) ? floatval($input['speed_kmh']) : 0.0;
$status    = isset($input['status']) ? $conn->real_escape_string($input['status']) : 'SAFE';

if ($latitude === null || $longitude === null) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "latitude and longitude are required"]);
    exit();
}

$sql = "INSERT INTO live_status (id, latitude, longitude, speed_kmh, status)
        VALUES (1, $latitude, $longitude, $speed_kmh, '$status')
        ON DUPLICATE KEY UPDATE
          latitude = $latitude, longitude = $longitude, speed_kmh = $speed_kmh, status = '$status'";

if ($conn->query($sql) === TRUE) {
    echo json_encode(["status" => "success"]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $conn->error]);
}

$conn->close();
?>
