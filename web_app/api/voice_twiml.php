<?php
// The words Twilio speaks on an emergency call. Twilio fetches this URL when
// the call connects. The message is signed with the Twilio auth token and
// expires after 15 minutes, so nobody else can make this page say anything.
// Output is only <Say> elements with escaped text.
require_once __DIR__ . '/lib/voice.php';

header("Content-Type: text/xml; charset=utf-8");
header("X-Content-Type-Options: nosniff");

$cfg = voice_config();
$m = (string) ($_REQUEST['m'] ?? '');
$s = (string) ($_REQUEST['s'] ?? '');
$payload = $cfg && $m !== '' ? voice_verify_payload($cfg, $m, $s) : null;

if (!$payload) {
    http_response_code(403);
    echo '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
    exit();
}
echo '<?xml version="1.0" encoding="UTF-8"?>' . voice_twiml($cfg, $payload['lines']);
