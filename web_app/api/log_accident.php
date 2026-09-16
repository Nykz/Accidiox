<?php
require_once 'db_config.php';

// Accept both JSON payload and form-data
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    $input = $_POST;
}

$status           = isset($input['status']) ? $conn->real_escape_string($input['status']) : 'CONFIRMED_CRASH';
$tilt_angle       = isset($input['tilt_angle']) ? floatval($input['tilt_angle']) : 0.0;
$roll_angle       = isset($input['roll_angle']) ? floatval($input['roll_angle']) : 0.0;
$pitch_angle      = isset($input['pitch_angle']) ? floatval($input['pitch_angle']) : 0.0;
$latitude         = isset($input['latitude']) ? floatval($input['latitude']) : NULL;
$longitude        = isset($input['longitude']) ? floatval($input['longitude']) : NULL;
$speed_kmh        = isset($input['speed_kmh']) ? floatval($input['speed_kmh']) : 0.0;
$nearest_hospital = isset($input['nearest_hospital']) ? $conn->real_escape_string($input['nearest_hospital']) : 'Not Specified';

$sql = "INSERT INTO accident_logs (status, tilt_angle, roll_angle, pitch_angle, latitude, longitude, speed_kmh, nearest_hospital, timestamp)
        VALUES ('$status', $tilt_angle, $roll_angle, $pitch_angle, " . 
        ($latitude !== NULL ? $latitude : "NULL") . ", " . 
        ($longitude !== NULL ? $longitude : "NULL") . ", $speed_kmh, '$nearest_hospital', NOW())";

if ($conn->query($sql) === TRUE) {
    echo json_encode([
        "status" => "success",
        "message" => "Log saved successfully",
        "log_id" => $conn->insert_id
    ]);
} else {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Failed to save: " . $conn->error]);
}

$conn->close();
?>
