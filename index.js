// =====================================================================
//   Monster PVP - Discord Ticket Bot + Web Server
//   نسخة مدمجة: ModMail + نظام التذاكر + MongoDB Atlas + متجر الويب
// =====================================================================

process.on('uncaughtException', (err) => {
    console.error('--- خطأ غير متوقع ---');
    console.error(err);
});

process.on('unhandledRejection', (reason) => {
    console.error('--- رفض غير معالج ---');
    console.error(reason);
});

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ChannelType,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');

const connectDB = require('./config/db');
const Ticket = require('./models/Ticket');
const { getNextSequence } = require('./models/Counter');

// ---------------------------------------------------------------
//  إعدادات من .env
// ---------------------------------------------------------------
const TICKET_CATEGORY_ID        = process.env.TICKET_CATEGORY_ID;
const FEEDBACK_CHANNEL_ID       = process.env.FEEDBACK_CHANNEL_ID;
const LOG_CHANNEL_ID            = process.env.LOG_CHANNEL_ID;
const ROLE_VIP_CUSTOMER         = process.env.ROLE_VIP_CUSTOMER;
const ROLE_WEB_STAFF            = process.env.ROLE_WEB_STAFF;
const ROLE_SUPPORT_STAFF        = process.env.ROLE_SUPPORT_STAFF;
const SUPPORT_TICKET_CATEGORY_ID = process.env.SUPPORT_TICKET_CATEGORY_ID;
const PORT                      = process.env.PORT || 3000;

// ---------------------------------------------------------------
//  Express App
// ---------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Web')));

// ---------------------------------------------------------------
//  Discord Client
// ---------------------------------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
});

// ذاكرة مؤقتة سريعة للتذاكر النشطة
const ticketData = new Map();

// ---------------------------------------------------------------
//  تسجيل أوامر السلاش
// ---------------------------------------------------------------
async function registerCommands() {
    const TOKEN    = process.env.DISCORD_TOKEN;
    const CLIENT_ID = process.env.CLIENT_ID;
    const GUILD_ID  = process.env.GUILD_ID;

    if (!CLIENT_ID || !GUILD_ID) {
        console.log('⚠️ CLIENT_ID أو GUILD_ID غير موجودين في .env - تم تخطي تسجيل أوامر السلاش');
        return;
    }

    const commands = [
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('إرسال لوحة نظام تذاكر الدعم الفني المطور'),
    ].map((cmd) => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('✅ تم تسجيل أمر /panel بنجاح');
    } catch (err) {
        console.error('❌ فشل تسجيل الأوامر:', err.message);
    }
}

// ---------------------------------------------------------------
//  عند جاهزية البوت
// ---------------------------------------------------------------
client.once('ready', async () => {
    console.log('\x1b[36m%s\x1b[0m', `
██╗    ██╗ █████╗ ███████╗███████╗███████╗██████╗ 
██║    ██║██╔══██╗╚══███╔╝██╔════╝██╔════╝██╔══██╗
██║ █╗ ██║███████║  ███╔╝ █████╗  █████╗  ██████╔╝
██║███╗██║██╔══██║ ███╔╝  ██╔══╝  ██╔══╝  ██╔══██╗
╚███╔███╔╝██║  ██║███████╗███████╗███████╗██║  ██║
 ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝
  `);
    console.log('\x1b[35m%s\x1b[0m', '==================================================');
    console.log(`✅ Logged in successfully as: ${client.user.tag}`);
    console.log('🎫 Monster Support Ticket System is now Online!');
    console.log('🛡️ Powered by Wazeer System');
    console.log('\x1b[35m%s\x1b[0m', '==================================================');

    // تحميل التذاكر المفتوحة من قاعدة البيانات إلى الذاكرة
    try {
        const openTickets = await Ticket.find({ status: 'open' });
        openTickets.forEach((t) => {
            ticketData.set(t.channelId, {
                ownerId:    t.ownerId,
                ownerTag:   t.ownerTag,
                assignedTo: t.assignedTo,
                openedBy:   t.ownerId,
            });
        });
        console.log(`📂 تم تحميل ${openTickets.length} تذكرة مفتوحة من قاعدة البيانات`);
    } catch (err) {
        console.error('⚠️ تعذر تحميل التذاكر من قاعدة البيانات:', err.message);
    }

    await registerCommands();
});

// =====================================================================
//   راوتس API
// =====================================================================
const createTicketRouter = require('./routes/ticketRoutes');
app.use('/api', createTicketRouter(client));

// =====================================================================
//   التفاعلات (Interactions)
// =====================================================================
client.on('interactionCreate', async (interaction) => {

    // ---------------------------------------------------------------
    // أزرار الموقع: قبول / رفض الطلب
    // ---------------------------------------------------------------
    if (
        interaction.isButton() &&
        (interaction.customId.startsWith('approve_order_') || interaction.customId.startsWith('reject_order_'))
    ) {
        if (!interaction.member.roles.cache.has(ROLE_WEB_STAFF)) {
            return interaction.reply({
                content: '❌ عذراً، هذه الأزرار حصرية لأعضاء رول إدارة الويب ستاف فقط!',
                ephemeral: true,
            });
        }

        const parts    = interaction.customId.split('_');
        const action   = parts[0];
        const memberId = parts[2];

        try {
            const member = await interaction.guild.members.fetch(memberId);

            if (action === 'approve') {
                await member.roles.add(ROLE_VIP_CUSTOMER);

                const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x2ecc71)
                    .setTitle('✅ تم قبول الطلب وتسليم الرول بنجاح')
                    .addFields({ name: '👮 المسؤول الموافق:', value: `${interaction.user}`, inline: false });

                await interaction.update({ embeds: [approvedEmbed], components: [] });
                await interaction.channel.send(
                    `🎉 مبارك للـ لاعب ${member}! تم قبول طلب الشراء وتم منحك الرول المخصصة بنجاح.`
                );

                await Ticket.findOneAndUpdate(
                    { channelId: interaction.channel.id },
                    { status: 'open' }
                ).catch(() => {});

            } else {
                const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xe74c3c)
                    .setTitle('❌ تم رفض هذا الطلب من الإدارة')
                    .addFields({ name: '👮 المسؤول الرافض:', value: `${interaction.user}`, inline: false });

                await interaction.update({ embeds: [rejectedEmbed], components: [] });
                await interaction.channel.send(
                    `⚠️ تم رفض الطلب الخاص بك يا ${member} من قبل الإدارة.`
                );
            }
        } catch (err) {
            console.error(err);
            return interaction.reply({
                content: '❌ حدث خطأ، تأكد من وجود اللاعب داخل السيرفر وأن رول البوت أعلى من رول اللاعبين لتسليمها.',
                ephemeral: true,
            });
        }
        return;
    }

    // ---------------------------------------------------------------
    // أمر /panel
    // ---------------------------------------------------------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
        if (!interaction.member.roles.cache.has(ROLE_SUPPORT_STAFF)) {
            return interaction.reply({
                content: '❌ ليس لديك الصلاحية الكافية لاستخدام لوحة التحكم هذه.',
                ephemeral: true,
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎫 Monster Ticket System')
            .setDescription(
                `> مرحباً بك في نظام الدعم الخاص بـ **Monster**!\n\n` +
                `📍 لفتح تذكرة دعم جديدة والمباشرة في حل مشكلتك، اضغط على الزر أدناه.\n` +
                `⚡ سيتم الرد عليك في أقرب وقت ممكن من قبل فريق الدعم الفني المتواجد.\n\n` +
                `\`\`\`\nيرجى قراءة القوانين أعلاه، وعدم معرفتك بالقوانين لا يعفيك من العقوبة\n\`\`\``
            )
            .setColor(0x5865f2)
            .setFooter({ text: 'Monster Support Ticket System • اضغط للبدء والتواصل' })
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket_btn')
                .setLabel('🎫 فتح تذكرة')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
    }

    // ---------------------------------------------------------------
    // زر فتح تذكرة → إظهار مودال السبب
    // ---------------------------------------------------------------
    if (interaction.isButton() && interaction.customId === 'open_ticket_btn') {
        const hasActiveTicket = [...ticketData.values()].some((data) => data.ownerId === interaction.user.id);
        if (hasActiveTicket) {
            return interaction.reply({
                content: '❌ **نعتذر منك، ولكن لديك تذكرة مفتوحة بالفعل في السيرفر!** يرجى إنهاء تذكرتك الحالية أولاً.',
                ephemeral: true,
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('ticket_reason_modal')
            .setTitle('فتح تذكرة دعم جديدة');

        const reasonInput = new TextInputBuilder()
            .setCustomId('ticket_reason')
            .setLabel('سبب فتح التذكرة')
            .setPlaceholder('اكتب هنا تفاصيل سبب فتح التذكرة بشكل واضح لنسهل خدمتك...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        return;
    }

    // ---------------------------------------------------------------
    // استلام سبب التذكرة وإنشاء القناة (ModMail — التواصل عبر DM)
    // ---------------------------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId === 'ticket_reason_modal') {
        await interaction.deferReply({ ephemeral: true });

        const reason = interaction.fields.getTextInputValue('ticket_reason');
        const guild  = interaction.guild;
        const member = interaction.member;

        let category;
        try {
            category = await guild.channels.fetch(TICKET_CATEGORY_ID);
        } catch {
            category = null;
        }

        if (!category) {
            return interaction.editReply({ content: '❌ القسم المخصص للتذاكر غير موجود أو تم حذفه!' });
        }

        const currentTicketNum = await getNextSequence('ticketCounter');
        const ticketName = `🎫-ticket-${currentTicketNum}`;

        let channel;
        try {
            channel = await guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                parent: TICKET_CATEGORY_ID,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    // صاحب التذكرة لا يرى القناة — يتواصل عبر DM فقط
                    { id: member.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    {
                        id: ROLE_SUPPORT_STAFF,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.EmbedLinks,
                            PermissionsBitField.Flags.AttachFiles,
                        ],
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.EmbedLinks,
                            PermissionsBitField.Flags.ReadMessageHistory,
                        ],
                    },
                ],
            });
        } catch (err) {
            console.error(err);
            return interaction.editReply({ content: '❌ فشل إنشاء قناة التذكرة، يرجى التحقق من صلاحيات البوت.' });
        }

        // حفظ في الذاكرة المؤقتة
        ticketData.set(channel.id, {
            ownerId:    member.id,
            ownerTag:   member.user.tag,
            assignedTo: null,
            openedBy:   member.user.id,
        });

        // حفظ في قاعدة البيانات
        try {
            await Ticket.create({
                channelId:    channel.id,
                ownerId:      member.id,
                ownerTag:     member.user.tag,
                type:         'support',
                ticketNumber: currentTicketNum,
                status:       'open',
                extraInfo:    reason,
            });
        } catch (err) {
            console.error('⚠️ فشل حفظ التذكرة في قاعدة البيانات:', err.message);
        }

        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 تذكرة جديدة — رقم ${currentTicketNum}`)
            .setDescription(
                `> تم فتح هذه التذكرة بواسطة **${member.user.tag}**\n\n` +
                `📝 __سبب فتح التذكرة المقدم:__\n\`\`\`\n${reason}\n\`\`\`\n` +
                `**📋 الأوامر المتاحة للإدارة داخل الروم:**\n` +
                `\`\`\`\n` +
                `-r [الرسالة]        → إرسال رد مباشر إلى الخاص مع منشن العضو\n` +
                `-ar                → استلام التذكرة والإشراف عليها\n` +
                `-f                 → إلغاء استلام التذكرة الحالية\n` +
                `-add [اليوزر/منشن] → إضافة عضو جديد للتذكرة عن طريق اليوزر أو المنشن\n` +
                `-del [اليوزر/منشن] → إزالة عضو من التذكرة عن طريق اليوزر أو المنشن\n` +
                `-cr                → إغلاق التذكرة نهائياً وتفعيل التقييم\n` +
                `-name [اسم]        → تغيير اسم القناة الحالية\n` +
                `\`\`\``
            )
            .setColor(0x57f287)
            .setFooter({ text: `Monster Ticket System • ${channel.name}` })
            .setTimestamp();

        await channel.send({ content: `<@&${ROLE_SUPPORT_STAFF}>`, embeds: [ticketEmbed] });

        // إرسال DM لصاحب التذكرة لإعلامه بأن يتواصل عبر الخاص
        try {
            await member.user.send(
                `✅ **تم فتح تذكرتك بنجاح في سيرفر ${guild.name}**\n` +
                `📝 **السبب:** ${reason}\n\n` +
                `💬 **يمكنك الكتابة هنا مباشرة في الخاص للرد على الدعم الفني!**`
            );
        } catch {}

        await interaction.editReply({
            content: `✅ **تم فتح تذكرتك بنجاح!** توجه الآن إلى الخاص (DM) للتواصل مباشرة مع فريق الدعم الفني.`,
        });
        return;
    }

    // ---------------------------------------------------------------
    // تأكيد إغلاق التذكرة (مودال السبب)
    // ---------------------------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('close_res_modal_')) {
        await interaction.deferReply();
        const channelId   = interaction.customId.split('_')[3];
        const closeReason = interaction.fields.getTextInputValue('close_reason_text');
        const ticket      = ticketData.get(channelId);
        const channel     = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
            return interaction.editReply({ content: '❌ تعذر العثور على قناة التذكرة.' });
        }

        const ownerId = ticket ? ticket.ownerId : null;

        // إرسال لوج الإغلاق
        try {
            const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔒 تم إغلاق تذكرة')
                    .setColor(0xed4245)
                    .addFields(
                        { name: '👤 صاحب التذكرة:', value: ownerId ? `<@${ownerId}>` : 'غير معروف (ممسوح من الذاكرة)', inline: true },
                        { name: '🛠️ أغلق بواسطة:', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📝 سبب الإغلاق:', value: `\`\`\`\n${closeReason}\n\`\`\`` }
                    )
                    .setFooter({ text: `اسم الروم: ${channel.name}` })
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (err) {
            console.error('فشل إرسال لوج الإغلاق:', err);
        }

        // تحديث حالة التذكرة في قاعدة البيانات
        try {
            await Ticket.findOneAndUpdate(
                { channelId },
                { status: 'closed', closeReason }
            );
        } catch (err) {
            console.error('⚠️ فشل تحديث حالة التذكرة في قاعدة البيانات:', err.message);
        }

        // إرسال DM لصاحب التذكرة مع رابط التقييم
        if (ownerId) {
            try {
                const owner = await client.users.fetch(ownerId);
                await owner.send(`🔒 **تم إغلاق تذكرتك بنجاح**\n📝 **السبب:** ${closeReason}`);

                const ratingRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`rate_1_${ownerId}`).setLabel('⭐ 1').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`rate_2_${ownerId}`).setLabel('⭐ 2').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`rate_3_${ownerId}`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`rate_4_${ownerId}`).setLabel('⭐ 4').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`rate_5_${ownerId}`).setLabel('⭐ 5').setStyle(ButtonStyle.Primary)
                );

                const ratingEmbed = new EmbedBuilder()
                    .setTitle('🌟 تقييم مستوى الخدمة')
                    .setDescription('فضلاً، قم بتقييم تجربتك مع فريق الدعم لمساعدتنا في تطوير الخدمة:')
                    .setColor(0xfee75c);

                await owner.send({ embeds: [ratingEmbed], components: [ratingRow] });
            } catch {}
        }

        await interaction.editReply({
            embeds: [new EmbedBuilder().setDescription('🔒 جاري حذف القناة خلال 3 ثوانٍ...').setColor(0xed4245)],
        });

        ticketData.delete(channelId);
        setTimeout(() => channel.delete().catch(() => {}), 3000);
        return;
    }

    // ---------------------------------------------------------------
    // تقييم الخدمة بعد إغلاق التذكرة
    // ---------------------------------------------------------------
    if (interaction.isButton() && interaction.customId.startsWith('rate_')) {
        const [, rating, userId] = interaction.customId.split('_');

        const feedbackRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`fdbk_btn_${rating}_${userId}`)
                .setLabel('📝 إضافة ملاحظات إضافية')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.update({
            content: `⭐ شكرًا لك على تقييمك بـ **${rating}/5** نجوم!`,
            embeds: [],
            components: [feedbackRow],
        });
        return;
    }

    // ---------------------------------------------------------------
    // مودال الملاحظات النهائية
    // ---------------------------------------------------------------
    if (interaction.isButton() && interaction.customId.startsWith('fdbk_btn_')) {
        const [, , rating, userId] = interaction.customId.split('_');

        const modal = new ModalBuilder()
            .setCustomId(`fdbk_submit_${rating}_${userId}`)
            .setTitle('ملاحظات التذكرة النهائية');

        const feedbackInput = new TextInputBuilder()
            .setCustomId('user_feedback_text')
            .setLabel('اكتب مراجعتك أو ملاحظاتك هنا')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(feedbackInput));
        await interaction.showModal(modal);
        return;
    }

    // ---------------------------------------------------------------
    // استلام الملاحظات وحفظها
    // ---------------------------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('fdbk_submit_')) {
        const [, , rating, userId] = interaction.customId.split('_');
        const notes = interaction.fields.getTextInputValue('user_feedback_text');

        await interaction.reply({ content: `✅ تم حفظ وإرسال مراجعتك بنجاح!`, ephemeral: true });

        // حفظ التقييم في قاعدة البيانات
        try {
            await Ticket.findOneAndUpdate(
                { ownerId: userId, status: 'closed' },
                { rating: Number(rating), feedbackNotes: notes },
                { sort: { updatedAt: -1 } }
            );
        } catch (err) {
            console.error('⚠️ فشل حفظ التقييم في قاعدة البيانات:', err.message);
        }

        // إرسال التقييم لقناة الـ Feedback
        try {
            const logChannel = await client.channels.fetch(FEEDBACK_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🌟 تقييم جديد من تذكرة')
                    .setDescription(`**العضو:** <@${userId}>\n**التقييم:** ${rating}/5\n**الملاحظات:** ${notes}`)
                    .setColor(0xfee75c);
                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch {}
        return;
    }
});

// =====================================================================
//   الرسائل (Messages) - ModMail + أوامر إدارة التذاكر
// =====================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ---------------------------------------------------------------
    // رسائل خاصة (DM) — ModMail: يرسل رسالة صاحب التذكرة إلى القناة
    // ---------------------------------------------------------------
    if (!message.guild) {
        const userTicket = [...ticketData.entries()].find(([, data]) => data.ownerId === message.author.id);
        if (!userTicket) return;

        const [channelId, data] = userTicket;
        let ticketChannel;
        try {
            ticketChannel = await client.channels.fetch(channelId);
        } catch {
            return;
        }
        if (!ticketChannel) return;

        const msgToSend         = `👤 **${message.author.username}** : ${message.content}`;
        const contentWithMention = data.assignedTo
            ? `<@${data.assignedTo}> \n${msgToSend}`
            : msgToSend;

        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            await ticketChannel.send({ content: contentWithMention, files: [attachment.url] });
        } else {
            await ticketChannel.send({ content: contentWithMention });
        }

        // رد تأكيد للمستخدم في DM
        await message.reply({ content: msgToSend }).catch(() => {});
        return;
    }

    // ---------------------------------------------------------------
    // رسائل في القنوات — أوامر إدارة التذاكر
    // ---------------------------------------------------------------
    const channel = message.channel;
    const ticket  = ticketData.get(channel.id);
    const content = message.content.trim();

    if (ticket) {
        // صاحب التذكرة لا يكتب في القناة — يستخدم DM فقط
        if (message.author.id === ticket.ownerId) {
            try { await message.delete(); } catch {}
            return message.channel
                .send({ content: `❌ <@${message.author.id}> **يرجى التحدث والكتابة داخل الخاص (DM) الخاص بالبوت فقط وليس هنا.**` })
                .then((msg) => setTimeout(() => msg.delete().catch(() => {}), 5000));
        }

        // لا رسائل من الستاف قبل استلام التذكرة بـ -ar
        if (!ticket.assignedTo && content !== '-ar') {
            try { await message.delete(); } catch {}
            return message.channel
                .send({ content: `❌ **يرجى استلام التذكرة أولاً بالرد بـ \`-ar\` لبدء المحادثة.**` })
                .then((msg) => setTimeout(() => msg.delete().catch(() => {}), 5000));
        }
    }

    // -r [رسالة] : الستاف يرد على صاحب التذكرة عبر DM
    if (content.startsWith('-r ')) {
        if (!ticket) return;
        const replyText = content.slice(3).trim();
        if (!replyText) return;

        try {
            const owner       = await client.users.fetch(ticket.ownerId);
            const highestRole = message.member.roles.highest.name !== '@everyone'
                ? message.member.roles.highest.name
                : 'Staff';
            const staffName      = message.member.displayName;
            const formattedMessage = `👑 **${highestRole}** [ **${staffName}** ] : ${replyText}`;

            await owner.send(`<@${ticket.ownerId}> \n${formattedMessage}`);
            await message.reply({ content: formattedMessage });
        } catch (err) {
            console.error(err);
        }
        return;
    }

    // -ar : استلام التذكرة
    if (content === '-ar') {
        if (!ticket) return;
        if (ticket.assignedTo) {
            return message.reply({ content: '❌ هذه التذكرة تم استلامها بالفعل.' });
        }
        ticket.assignedTo = message.author.id;
        ticketData.set(channel.id, ticket);

        await Ticket.findOneAndUpdate({ channelId: channel.id }, { assignedTo: message.author.id }).catch(() => {});
        await message.channel.send({ content: `✨ **لقد استلم <@${message.author.id}> التذكرة ومتابعتها الآن.**` });
        return;
    }

    // -f : إلغاء الاستلام
    if (content === '-f') {
        if (!ticket) return;
        if (!ticket.assignedTo || ticket.assignedTo !== message.author.id) {
            return message.reply({ content: '⚠️ عذراً، لا يمكنك إلغاء استلام تذكرة لم تقم بالإشراف عليها.' });
        }
        ticket.assignedTo = null;
        ticketData.set(channel.id, ticket);

        await Ticket.findOneAndUpdate({ channelId: channel.id }, { assignedTo: null }).catch(() => {});
        await message.channel.send({ content: '✅ تم إلغاء استلام التذكرة بنجاح.' });
        return;
    }

    // -add [يوزر/منشن] : إضافة عضو للتذكرة
    if (content.startsWith('-add ')) {
        if (!ticket) return;
        const input = content.slice(5).trim();
        if (!input) return message.reply({ content: '⚠️ يرجى كتابة يوزر العضو أو عمل منشن له بعد الأمر.' });

        const targetMember = message.mentions.members.size > 0
            ? message.mentions.members.first()
            : message.guild.members.cache.find((m) => m.user.username.toLowerCase() === input.toLowerCase());

        if (!targetMember) {
            return message.reply({ content: '❌ لم يتم العثور على هذا العضو بالسيرفر (تأكد من كتابة اليوزر بشكل صحيح بدون @).' });
        }

        try {
            await channel.permissionOverwrites.create(targetMember, {
                ViewChannel: true, SendMessages: false, ReadMessageHistory: true,
            });
            await message.reply({ content: `✅ تم إضافة العضو **${targetMember.user.username}** بنجاح إلى التذكرة.` });
        } catch {
            await message.reply({ content: '❌ فشل إضافة صلاحيات العضو.' });
        }
        return;
    }

    // -del [يوزر/منشن] : إزالة عضو من التذكرة
    if (content.startsWith('-del ')) {
        if (!ticket) return;
        const input = content.slice(5).trim();
        if (!input) return message.reply({ content: '⚠️ يرجى كتابة يوزر العضو أو عمل منشن له لإزالته.' });

        const targetMember = message.mentions.members.size > 0
            ? message.mentions.members.first()
            : message.guild.members.cache.find((m) => m.user.username.toLowerCase() === input.toLowerCase());

        if (!targetMember) {
            return message.reply({ content: '❌ لم يتم العثور على هذا العضو بالسيرفر.' });
        }
        if (targetMember.id === ticket.ownerId) {
            return message.reply({ content: '❌ لا يمكنك إزالة صاحب التذكرة الأساسي!' });
        }

        try {
            await channel.permissionOverwrites.delete(targetMember);
            await message.reply({ content: `🚫 تم إزالة العضو **${targetMember.user.username}** من التذكرة بنجاح.` });
        } catch {
            await message.reply({ content: '❌ فشل تعديل صلاحيات العضو أو إزالته.' });
        }
        return;
    }

    // -cr : إغلاق التذكرة
    if (content === '-cr') {
        if (!ticket) return;
        if (!message.member.roles.cache.has(ROLE_SUPPORT_STAFF)) return;

        const closeTriggerRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`cls_trig_${channel.id}`)
                .setLabel('🔒 تأكيد إغلاق التذكرة')
                .setStyle(ButtonStyle.Danger)
        );
        const triggerMsg = await message.reply({
            content: '⚡ اضغط على الزر أدناه لتأكيد إغلاق التذكرة:',
            components: [closeTriggerRow],
        });

        const filter    = (i) => i.customId === `cls_trig_${channel.id}` && i.user.id === message.author.id;
        const collector = channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async (i) => {
            const modal = new ModalBuilder()
                .setCustomId(`close_res_modal_${channel.id}`)
                .setTitle('سبب إغلاق التذكرة');
            const reasonInput = new TextInputBuilder()
                .setCustomId('close_reason_text')
                .setLabel('اكتب سبب الإغلاق النهائي')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            await i.showModal(modal);
            await triggerMsg.delete().catch(() => {});
        });
        return;
    }

    // -name [اسم] : تغيير اسم القناة
    if (content.startsWith('-name ')) {
        if (!ticket) return;
        const newName = content.slice(6).trim().toLowerCase().replace(/\s+/g, '-');
        try { await channel.setName(newName); } catch {}
        return;
    }
});

// =====================================================================
//   تشغيل السيرفر وقاعدة البيانات والبوت
// =====================================================================
(async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`🌐 الموقع وسيرفر الربط مع البوت يعملان على: http://localhost:${PORT}`);
    });

    const TOKEN = process.env.DISCORD_TOKEN;
    if (!TOKEN) {
        console.error('❌ DISCORD_TOKEN غير موجود في .env - تعذر تشغيل البوت');
        return;
    }
    client.login(TOKEN).catch((err) => {
        console.error('❌ فشل تسجيل دخول البوت:', err.message);
    });
})();
