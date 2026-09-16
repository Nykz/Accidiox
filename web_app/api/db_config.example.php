<?php
// Copy this file to db_config.php and fill in real values — db_config.php
// itself is gitignored (never committed) because it holds live database
// credentials once deployed. On Hostinger, edit it directly via SSH/File
// Manager after creating your MySQL database in hPanel.
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");

// PHP 8.1+ makes mysqli throw exceptions by default instead of just
// setting connect_error — restore the classic behavior so DB errors
// come back as clean JSON instead of a blank HTTP 500.
mysqli_report(MYSQLI_REPORT_OFF);

$host     = "localhost";
$username = "your_db_username";
$password = "your_db_password";
$database = "your_db_name";

$conn = new mysqli($host, $username, $password, $database);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Database connection failed: " . $conn->connect_error]);
    exit();
}
?>
