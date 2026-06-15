// ===================================================
//  موديل التذاكر (Tickets) - يحفظ بيانات كل تذكرة بشكل دائم
// ===================================================
const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true }, // آي دي قناة التذكرة في ديسكورد
    ownerId: { type: String, required: true },                  // آي دي صاحب التذكرة
    ownerTag: { type: String },                                 // يوزر صاحب التذكرة
    type: { type: String, default: 'support' },                 // نوع التذكرة
    ticketNumber: { type: Number },                             // رقم التذكرة
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    assignedTo: { type: String, default: null },
    products: { type: String, default: '' },
    playerName: { type: String, default: '' },
    extraInfo: { type: String, default: '' },
    closeReason: { type: String, default: null },
    rating: { type: Number, default: null },
    feedbackNotes: { type: String, default: null },
}, { timestamps: true });

const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);

// حذف جميع التذاكر عند تشغيل البوت
mongoose.connection.once('connected', async () => {
    try {
        const result = await Ticket.deleteMany({});
        console.log(`🗑️ تم حذف ${result.deletedCount} تذكرة من قاعدة البيانات`);
    } catch (err) {
        console.error('❌ فشل حذف التذاكر:', err);
    }
});

module.exports = Ticket;