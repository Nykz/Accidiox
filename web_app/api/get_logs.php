<?php
require_once 'db_config.php';

$sql = "SELECT * FROM accident_logs ORDER BY timestamp DESC LIMIT 50";
$result = $conn->query($sql);

$logs = [];
if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        $logs[] = $row;
    }
}

echo json_encode([
    "status" => "success",
    "count" => count($logs),
    "data" => $logs
]);

$conn->close();
?>
