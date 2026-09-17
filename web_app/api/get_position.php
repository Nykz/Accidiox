<?php
require_once 'db_config.php';

$sql = "SELECT latitude, longitude, speed_kmh, status, updated_at,
        TIMESTAMPDIFF(SECOND, updated_at, NOW()) AS seconds_ago
        FROM live_status WHERE id = 1";
$result = $conn->query($sql);

if ($result && $row = $result->fetch_assoc()) {
    echo json_encode(["status" => "success", "data" => $row]);
} else {
    echo json_encode(["status" => "success", "data" => null]);
}

$conn->close();
?>
