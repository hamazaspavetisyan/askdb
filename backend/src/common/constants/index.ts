export const waitlistThrottleLimit = 5;
export const verifyEmailThrottleLimit = 10;
export const resendThrottleLimit = 12;
export const checkEmailThrottleLimit = 20;
export const checkOnboardingThrottleLimit = 20;
export const transferThrottleLimit = 4;
export const defaultThrottleLimit = 1000000;
export const createUserThrottleLimit = 12;
export const numberOfHours = 1;
export const numberOfMinutes = 1;
export const passwordRegexp =
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*+\-])[A-Za-z\d!@#$%^&*+\-]{8,30}$/;
export const SMSApiUrl = 'https://msg.am/Xml_Api/index.php';

export const phoneMatchingSymbolsCount = 8;

export const failedTransactionTimeoutMinutes = 12;

// User activity monitoring constants
// Touchpoints: Day 14 (first), 90 (3 months), 180 (6 months), 330 (11 months - final warning)
export const USER_ACTIVITY_REMINDER_DAYS = [1, 3, 7, 14, 21, 30, 60, 90];
export const USER_ACTIVITY_DELETION_DAYS = 365; // 12 months of inactivity
export const USER_ACTIVITY_DELETION_REASON =
    'Account deleted due to inactivity - no eligible transactions within 12 months';

export const LIMITS_SETTING_NAME = 'limits';
