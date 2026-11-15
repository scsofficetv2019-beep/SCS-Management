/* =====================================================================
 *  SCS Management — সার্ভারের SMS ও Email সেটিং (ডিপ্লয়ের সাথে সাথেই কাজ করবে)
 *
 *  এখানে আপনার SMS কোম্পানির তথ্য আর Gmail (SMTP) বসালে প্রথম দিন থেকেই
 *  অ্যাকাউন্ট খোলা / লগইন / পাসওয়ার্ড রিসেটের কোড যাবে — কোনো অ্যাকাউন্টে লগইন না করেই।
 *
 *  পরে চাইলে Admin Console > SMS & Email থেকে বদলানো যায়।
 *  Admin Console এ কিছু সেভ করলে সেটাই আগে ব্যবহার হয়, তারপর এই ফাইল।
 *
 *  নিরাপত্তা:
 *   - এই ফাইল শুধু Netlify server function পড়ে; ওয়েবসাইট থেকে কেউ খুলতে পারে না
 *     (netlify.toml এ /netlify/* ব্লক করা আছে)।
 *   - GitHub repository অবশ্যই Private রাখুন।
 *   - চাইলে এখানে না লিখে Netlify > Environment variables এও দিতে পারেন:
 *     SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME
 *     (Environment variable থাকলে সেটাই এই ফাইলের চেয়ে আগে ব্যবহার হয়)
 * ===================================================================== */
export default {
  sms: {
    // SMS পাঠানোর এন্ডপয়েন্ট লিংক, যেমন: 'https://bulksmsbd.net/api/smsapi'
    apiUrl: 'https://api.sms.net.bd/sendsms',
    // আপনার SMS API key
    apiKey: 'duO9dvaO33mab2ir8gaPXj6gitGSKFhriWYc8ACk',
    // Sender ID / Masking ID (কোম্পানির নাম বা নম্বর যেটা SMS এ দেখাবে)
    senderId: 'SWARUP CONS',
    // 'POST' বা 'GET' — আপনার SMS কোম্পানির নিয়ম অনুযায়ী
    method: 'POST',
    // SMS কোম্পানি কোন নামে তথ্য চায় (ডকুমেন্টেশন দেখে মিলিয়ে নিন)
    // উদাহরণ BulkSMSBD: { apiKey: 'api_key', message: 'message', to: 'number', senderId: 'senderid' }
    params: { apiKey: 'api_key', message: 'msg', to: 'to', senderId: 'sender_id' }
  },
  smtp: {
    // Gmail: host 'smtp.gmail.com', port 465
    host: 'smtp.gmail.com',
    port: 465,
    // আপনার Gmail ঠিকানা, যেমন 'scssouravmridha@gmail.com'
    user: '',
    // Gmail App Password (১৬ অক্ষর) — সাধারণ Gmail পাসওয়ার্ড নয়।
    // Google Account > Security > 2-Step Verification চালু করে > App passwords থেকে বানান
    pass: '',
    // ইমেইলে প্রেরকের নাম
    fromName: 'SCS Management'
  }
};
