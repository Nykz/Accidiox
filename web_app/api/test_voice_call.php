<?php
// Immediate Test Utility for Twilio Automated Voice Call
header("Content-Type: application/json");

require_once __DIR__ . '/twilio_voice_config.php';

if (empty($twilio_auth_token) || $twilio_auth_token === "PASTE_YOUR_FULL_AUTH_TOKEN_HERE") {
    echo json_encode([
        "status" => "error",
        "message" => "Please paste your full 32-character Auth Token into web_app/api/twilio_voice_config.php"
    ], JSON_PRETTY_PRINT);
    exit();
}

$toPhone = isset($_GET['phone']) ? $_GET['phone'] : "+917086249545";
$location = "Lanka, Varanasi";
$hospital = "Sir Sunderlal Hospital, BHU";

$alertMessage = "Emergency Alert from Accidiox Safety System. A critical motorcycle accident has been detected near " . $location . ". Live GPS coordinates and crash telemetry have been dispatched to " . $hospital . ". Immediate medical assistance is requested.";

if (!empty($twilio_twiml_url)) {
    $callUrl = $twilio_twiml_url;
} else {
    $encodedMsg = urlencode($alertMessage);
    $callUrl = "https://twimlets.com/message?Message%5B0%5D={$encodedMsg}";
}

$url = "https://api.twilio.com/2010-04-01/Accounts/{$twilio_account_sid}/Calls.json";

$postData = [
    "To"   => $toPhone,
    "From" => $twilio_from_number,
    "Url"  => $callUrl
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_USERPWD, "{$twilio_account_sid}:{$twilio_auth_token}");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    echo json_encode(["status" => "curl_error", "error" => $curlErr], JSON_PRETTY_PRINT);
    exit();
}

$decoded = json_decode($response, true);
echo json_encode([
    "http_status" => $httpCode,
    "to" => $toPhone,
    "from" => $twilio_from_number,
    "response" => $decoded
], JSON_PRETTY_PRINT);
?>
