<?php
// Twilio Automated Emergency Cloud Voice Call Gateway
// Directly places outbound phone calls to emergency contacts and hospital helplines
// with automated Text-to-Speech (TTS) voice broadcasting. Zero manual clicks needed.

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/sos.php';
[$rider, $incident, $contacts] = sos_guard($conn, 'voice');

$configFile = __DIR__ . '/twilio_voice_config.php';
$isConfigured = false;

if (file_exists($configFile)) {
    require_once $configFile;
    if (!empty($twilio_account_sid) && !empty($twilio_auth_token) && !empty($twilio_from_number) && strpos($twilio_account_sid, "ACxxx") === false) {
        $isConfigured = true;
    }
}

$input = read_json();

// Contacts come only from the rider's account (sos_guard). Spoken text is
// capped and stripped of markup.
$locationName = sos_text($input['locationName'] ?? '', 120) ?: ($incident['location_name'] ?: "the rider's location");
$hospitalName = sos_text($input['hospitalName'] ?? '', 120) ?: "the nearest hospital";

if (count($contacts) === 0) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "No emergency contacts available to call"]);
    exit();
}

$voiceActor = isset($twilio_voice_actor) ? $twilio_voice_actor : "Polly.Aditi";
$voiceLang  = isset($twilio_voice_language) ? $twilio_voice_language : "en-IN";

// TwiML text for the automated voice call
$twimlXml = '<Response>' .
    '<Pause length="1"/>' .
    '<Say voice="' . htmlspecialchars($voiceActor) . '" language="' . htmlspecialchars($voiceLang) . '">' .
    'Emergency Alert from Accidiox Safety System. ' .
    'A critical motorcycle accident has been detected near ' . htmlspecialchars($locationName) . '. ' .
    'Live GPS coordinates and crash telemetry have been dispatched to ' . htmlspecialchars($hospitalName) . '. ' .
    'Immediate medical assistance is requested.' .
    '</Say>' .
    '<Pause length="1"/>' .
    '<Say voice="' . htmlspecialchars($voiceActor) . '" language="' . htmlspecialchars($voiceLang) . '">' .
    'Repeating message. Accident detected near ' . htmlspecialchars($locationName) . '. Please check WhatsApp and SMS for the live Google Maps location pin.' .
    '</Say>' .
    '</Response>';

function place_twilio_voice_call($accountSid, $authToken, $fromNumber, $toPhone, $alertMessage, $customTwimlUrl = null) {
    $url = "https://api.twilio.com/2010-04-01/Accounts/{$accountSid}/Calls.json";

    // Format phone with + and country code (defaults to +91 India if 10 digits)
    $digits = preg_replace('/[^0-9]/', '', $toPhone);
    if (strlen($digits) === 10) {
        $toFormatted = "+91" . $digits;
    } elseif (strlen($digits) === 11 && substr($digits, 0, 1) === "0") {
        $toFormatted = "+91" . substr($digits, 1);
    } elseif (strpos($toPhone, '+') === 0) {
        $toFormatted = "+" . $digits;
    } else {
        $toFormatted = "+91" . $digits;
    }

    if (!empty($customTwimlUrl)) {
        $callUrl = $customTwimlUrl;
    } else {
        $encodedMsg = urlencode($alertMessage);
        $callUrl = "https://twimlets.com/message?Message%5B0%5D={$encodedMsg}";
    }

    $postData = [
        "To"   => $toFormatted,
        "From" => $fromNumber,
        "Url"  => $callUrl
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_USERPWD, "{$accountSid}:{$authToken}");
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        return ["ok" => false, "error" => $curlErr, "to" => $toFormatted];
    }

    $decoded = json_decode($response, true);
    if ($httpCode >= 200 && $httpCode < 300) {
        return [
            "ok"      => true,
            "callSid" => isset($decoded['sid']) ? $decoded['sid'] : 'queued',
            "status"  => isset($decoded['status']) ? $decoded['status'] : 'queued',
            "to"      => $toFormatted
        ];
    } else {
        $msg = isset($decoded['message']) ? $decoded['message'] : "HTTP $httpCode Error";
        return ["ok" => false, "error" => $msg, "to" => $toFormatted];
    }
}

$results = [];

if (!$isConfigured) {
    // Graceful diagnostic response showing call payload ready
    foreach ($contacts as $contact) {
        $phone = isset($contact['phone']) ? $contact['phone'] : '';
        $name  = isset($contact['name']) ? $contact['name'] : $phone;
        $results[] = [
            "name"   => $name,
            "phone"  => $phone,
            "called" => false,
            "mode"   => "ready_for_credentials",
            "detail" => "Twilio SID not set in twilio_voice_config.php. Outbound IVR call queue payload generated."
        ];
    }
    echo json_encode([
        "status"  => "not_configured",
        "message" => "twilio_voice_config.php requires Twilio Trial SID/Token to dial active carrier lines.",
        "results" => $results
    ]);
    exit();
}

$voiceMessage = "Emergency alert from Accidiox Safety System. A critical motorcycle accident has been detected near " . $locationName . ". Live GPS coordinates and telemetry have been dispatched to " . $hospitalName . ". Immediate medical assistance is requested.";

$twimlUrlParam = isset($twilio_twiml_url) ? $twilio_twiml_url : null;

foreach ($contacts as $contact) {
    $phone = isset($contact['phone']) ? $contact['phone'] : '';
    $name  = isset($contact['name']) ? $contact['name'] : $phone;
    if ($phone === '') continue;

    $res = place_twilio_voice_call($twilio_account_sid, $twilio_auth_token, $twilio_from_number, $phone, $voiceMessage, $twimlUrlParam);
    $results[] = [
        "name"   => $name,
        "phone"  => $res['to'],
        "called" => $res['ok'],
        "detail" => $res['ok'] ? "Automated Voice Call Queued (SID: {$res['callSid']})" : $res['error']
    ];
}

echo json_encode([
    "status"  => "done",
    "message" => "Automated IVR emergency calls triggered.",
    "results" => $results
]);
?>
