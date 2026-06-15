// ===================================================
//  موديل العداد (Counter) - لحفظ رقم آخر تذكرة بشكل دائم
//  بدل متغير ticketCounter الذي كان يضيع عند إعادة تشغيل البوت
// ===================================================
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // مثال: "ticketCounter"
    value: { type: Number, default: 1 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * يرجع القيمة الحالية للعداد ثم يزيدها بواحد (atomic) — يضمن عدم تكرار رقم التذكرة
 * @param {string} name - اسم العداد
 * @returns {Promise<number>}
 */
async function getNextSequence(name) {
    const counter = await Counter.findOneAndUpdate(
        { name },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
    );
    return counter.value;
}

module.exports = { Counter, getNextSequence };
