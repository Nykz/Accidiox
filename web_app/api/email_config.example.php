<?php
// Configuration for Automated Emergency Email Dispatch
// Rename or copy this file to email_config.php

// Sender Configuration
$email_sender_name    = "Accidiox Emergency Safety Network";
$email_sender_address = "emergency-alert@accidiox-safety.org"; // or your-email@gmail.com

// Dispatch Mode: "smtp" (recommended for production/Gmail) or "mail" (native PHP mail)
$email_delivery_mode  = "mail"; 

// SMTP Settings (Optional, used when $email_delivery_mode = "smtp")
$smtp_host     = "smtp.gmail.com";
$smtp_port     = 587; // 587 (TLS) or 465 (SSL)
$smtp_username = "your-gmail-address@gmail.com";
$smtp_password = "your-google-app-password"; // 16-character App Password
$smtp_secure   = "tls";

// Regional Emergency Hospital & Trauma Desks Directory (Fallback if map data has no email)
$emergency_hospital_fallback_emails = [
    "Varanasi" => "trauma.desk.bhu@gmail.com",
    "National_112_ERSS" => "dispatch@112.gov.in",
    "Ambulance_108" => "emergency@emri108.in",
    "Default" => "traumacenter.emergency@gmail.com"
];
?>
