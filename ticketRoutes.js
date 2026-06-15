// ===================================================
//  راوتس API المتجر (الموقع) - فتح تذاكر من الواجهة
// ===================================================
const express = require('express');
const router = express.Router();
const {
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const Ticket = require('../models/Ticket');

const CATEGORIES = {
    purchase: process.env.SUPPORT_TICKET_CATEGORY_ID,
    inquiry: process.env.SUPPORT_TICKET_CATEGORY_ID,
    complaint: process.env.SUPPORT_TICKET_CATEGORY_ID,
};

const ROLE_WEB_STAFF = process.env.ROLE_WEB_STAFF;

module.exports = function createTicketRouter(client) {

    // -------- إنشاء تذكرة من الموقع --------
    router.post('/create-ticket', async (req, res) => {
        const { discordTag, type, products, extraInfo, name } = req.body;

        if (!discordTag || !type) {
            return res.status(400).json({ success: false, message: 'بيانات الطلب غير مكتملة!' });
        }

        const categoryId = CATEGORIES[type];
        if (!categoryId) {
            return res.status(400).json({ success: false, message: 'نوع التذكرة غير مدعوم برمجياً!' });
        }

        try {
            const guild = client.guilds.cache.first();
            if (!guild) {
                return res.status(500).json({ success: false, message: 'البوت لم يتعرف على السيرفر بعد!' });
            }

            // البحث عن العضو المطلوب فقط بدل جلب كل أعضاء السيرفر (لتجنب Rate Limit على opcode 8)
            let member = null;
            try {
                const results = await guild.members.search({ query: discordTag, limit: 5 });
                member = results.find(
                    (m) =>
                        m.user.username.toLowerCase() === discordTag.toLowerCase() ||
                        m.user.tag.toLowerCase() === discordTag.toLowerCase()
                ) || null;
            } catch (searchErr) {
                console.error('⚠️ فشل البحث عن العضو:', searchErr.message);
            }

            if (!member) {
                return res.status(404).json({
                    success: false,
                    message: 'لم نجد حساب الديسكورد هذا في السيرفر، برجاء الدخول للسيرفر أولاً!',
                });
            }

            const ticketChannel = await guild.channels.create({
                name: `${type}-${member.user.username}`,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    {
                        id: member.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                        ],
                    },
                    {
                        id: ROLE_WEB_STAFF,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                        ],
                    },
                ],
            });

            let embedTitle = '🎫 تذكرة موقع جديدة';
            let embedColor = 0x00ff88;
            let showButtons = false;
            const embed = new EmbedBuilder().setTimestamp();

            if (type === 'purchase') {
                embedTitle = '🛒 طلب شراء جديد - تذكرة موقع';
                embedColor = 0xf1c40f;
                showButtons = true;

                embed
                    .setDescription(`مرحباً بك في تذكرة الشراء الخاصة بمتجر **Monster PVP**. يرجى انتظار الإدارة.`)
                    .addFields(
                        { name: '👤 اسم المشتري الحقيقي:', value: name || 'غير متوفر', inline: true },
                        { name: '🕹️ يوزر الديسكورد:', value: `${member} (${discordTag})`, inline: true },
                        { name: '🛒 المنتجات المطلوبة:', value: products || 'لا يوجد منتجات', inline: false },
                        { name: '📝 المعلومات الإضافية:', value: extraInfo || 'لا يوجد تفاصيل', inline: false }
                    );
            } else if (type === 'inquiry') {
                embedTitle = '❓ تذكرة استفسار جديدة';
                embedColor = 0x3498db;
                embed
                    .setDescription(`تم فتح تذكرة استفسار بواسطة لاعب من الموقع.`)
                    .addFields(
                        { name: '👤 اللاعب المستفسر:', value: `${member}`, inline: true },
                        { name: '📝 نص الاستفسار:', value: extraInfo || 'فارغ' }
                    );
            } else if (type === 'complaint') {
                embedTitle = '⚠️ تذكرة شكوى جديدة';
                embedColor = 0xe74c3c;
                embed
                    .setDescription(`تم تقديم شكوى من الموقع وتحتاج لمراجعة من الإدارة.`)
                    .addFields(
                        { name: '👤 مقدم الشكوى:', value: `${member}`, inline: true },
                        { name: '📝 تفاصيل الشكوى:', value: extraInfo || 'لا يوجد تفاصيل' }
                    );
            }

            embed.setTitle(embedTitle).setColor(embedColor);

            const messageOptions = {
                content: `<@&${ROLE_WEB_STAFF}> | تذكرة جديدة بواسطة ${member}`,
                embeds: [embed],
            };

            if (showButtons) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_order_${member.id}_${(products || 'منتج').substring(0, 30)}`)
                        .setLabel('🟢 قبول الطلب وإعطاء الرول')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_order_${member.id}`)
                        .setLabel('🔴 رفض الطلب')
                        .setStyle(ButtonStyle.Danger)
                );
                messageOptions.components = [row];
            }

            await ticketChannel.send(messageOptions);

            // حفظ التذكرة في قاعدة البيانات بشكل دائم
            await Ticket.create({
                channelId: ticketChannel.id,
                ownerId: member.id,
                ownerTag: member.user.tag,
                type,
                status: 'open',
                products: products || '',
                playerName: name || '',
                extraInfo: extraInfo || '',
            });

            return res.status(200).json({ success: true, message: 'تم فتح التذكرة بنجاح!' });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ success: false, message: 'حدث خطأ داخلي في البوت!' });
        }
    });

    // -------- إعدادات الواجهة (يُستخدم بدل القيم الثابتة في script.js) --------
    router.get('/config', (req, res) => {
        res.json({
            discordClientId: process.env.DISCORD_OAUTH_CLIENT_ID,
            redirectUri: process.env.DISCORD_REDIRECT_URI,
            apiBaseUrl: process.env.SITE_URL,
        });
    });

    return router;
};
