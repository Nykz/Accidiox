<?php
// Local XAMPP MySQL Database Configuration.
//
// SECURITY NOTE: this repo is public on GitHub. When deploying to Hostinger
// (or any live host), edit the 4 values below directly on the server via
// File Manager/SSH — never commit real production DB credentials here.
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");

// PHP 8.1+ makes mysqli throw exceptions by default. get_logs.php and
// log_accident.php both check $conn->connect_error / ->query() return
// values the old-fashioned way, so restore that behavior explicitly —
// otherwise any DB error is an uncaught exception (blank HTTP 500, no
// JSON body) instead of the clean error response those scripts expect.
mysqli_report(MYSQLI_REPORT_OFF);

$host     = "127.0.0.1";
$port     = 3307; // Configured for your XAMPP MySQL port
$username = "root";
$password = ""; // Default XAMPP password is empty
$database = "two_wheeler_blackbox";

// Connect with port 3307
$conn = new mysqli($host, $username, $password, $database, $port);

if ($conn->connect_error) {
    // Fallback to standard port 3306 if 3307 fails
    $conn = new mysqli("127.0.0.1", $username, $password, $database, 3306);
    if ($conn->connect_error) {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Database connection failed: " . $conn->connect_error]);
        exit();
    }
}
?>
