// ===================================================
//  ملف الاتصال بقاعدة بيانات MongoDB Atlas
// ===================================================
const mongoose = require('mongoose');

async function connectDB() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error('❌ MONGODB_URI غير موجود في ملف .env — لن يتم الاتصال بقاعدة البيانات.');
        return;
    }

    try {
        await mongoose.connect(uri);
        console.log('✅ تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح');
    } catch (err) {
        console.error('❌ فشل الاتصال بقاعدة بيانات MongoDB:', err.message);
    }
}

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ تم قطع الاتصال بقاعدة البيانات MongoDB');
});

module.exports = connectDB;
