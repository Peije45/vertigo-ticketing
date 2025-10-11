// netlify/functions/scheduled-sync.js
// Synchronisation automatique des tickets toutes les X minutes
// Cette fonction est exécutée automatiquement par Netlify

const { neon } = require('@neondatabase/serverless');
const { schedule } = require('@netlify/functions');

// Fonction principale de synchronisation
const syncTickets = async () => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const DISCORD_SERVER_ID = process.env.DISCORD_SERVER_ID || '1288511254369013831';
  
  console.log('🔄 Début de la synchronisation automatique...');
  
  try {
    const sql = neon(DATABASE_URL);
    
    // Récupérer tous les tickets actifs (non fermés)
    const activeTickets = await sql`
      SELECT id, discord_channel_id, unread_count
      FROM tickets 
      WHERE status != 'resolu'
      ORDER BY created_at DESC
    `;
    
    console.log(`📋 ${activeTickets.length} tickets actifs à synchroniser`);
    
    let newMessagesCount = 0;
    let ticketsUpdated = 0;
    
    // Pour chaque ticket, vérifier les nouveaux messages
    for (const ticket of activeTickets) {
      try {
        // Récupérer le dernier message qu'on a en BDD pour ce ticket
        const lastMessages = await sql`
          SELECT discord_message_id, created_at
          FROM ticket_messages
          WHERE ticket_id = ${ticket.id}
          ORDER BY created_at DESC
          LIMIT 1
        `;
        
        const lastMessageId = lastMessages.length > 0 ? lastMessages[0].discord_message_id : null;
        
        // Récupérer les nouveaux messages depuis Discord
        const url = lastMessageId 
          ? `https://discord.com/api/v10/channels/${ticket.discord_channel_id}/messages?after=${lastMessageId}&limit=100`
          : `https://discord.com/api/v10/channels/${ticket.discord_channel_id}/messages?limit=100`;
        
        const messagesResponse = await fetch(url, {
          headers: {
            'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!messagesResponse.ok) {
          console.log(`⚠️ Channel ${ticket.discord_channel_id} inaccessible (peut-être supprimé)`);
          continue;
        }
        
        const messages = await messagesResponse.json();
        
        // Filtrer les messages de bots et ceux qu'on a déjà
        const newMessages = messages.filter(m => 
          !m.author.bot && 
          m.content && 
          m.content.length > 0
        );
        
        if (newMessages.length === 0) {
          continue; // Pas de nouveaux messages
        }
        
        // Insérer les nouveaux messages
        for (const msg of newMessages) {
          try {
            await sql`
              INSERT INTO ticket_messages (
                ticket_id,
                discord_message_id,
                author_discord_id,
                author_username,
                author_avatar_url,
                content,
                is_from_staff,
                created_at
              ) VALUES (
                ${ticket.id},
                ${msg.id},
                ${msg.author.id},
                ${msg.author.username},
                ${msg.author.avatar ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png` : null},
                ${msg.content.substring(0, 2000)},
                false,
                ${new Date(msg.timestamp).toISOString()}
              )
              ON CONFLICT (discord_message_id) DO NOTHING
            `;
            newMessagesCount++;
          } catch (err) {
            console.log(`Erreur insertion message ${msg.id}:`, err.message);
          }
        }
        
        // Mettre à jour le ticket
        if (newMessages.length > 0) {
          await sql`
            UPDATE tickets 
            SET 
              is_unread = true,
              unread_count = unread_count + ${newMessages.length},
              has_new_messages = true,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${ticket.id}
          `;
          ticketsUpdated++;
        }
        
      } catch (error) {
        console.error(`Erreur ticket ${ticket.id}:`, error.message);
      }
    }
    
    console.log(`✅ Synchronisation terminée: ${newMessagesCount} nouveaux messages dans ${ticketsUpdated} tickets`);
    
    return {
      success: true,
      new_messages: newMessagesCount,
      tickets_updated: ticketsUpdated,
      total_tickets: activeTickets.length
    };
    
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    throw error;
  }
};

// Exporter la fonction schedulée
// Elle s'exécutera automatiquement toutes les 2 minutes
exports.handler = schedule('*/2 * * * *', syncTickets);

// Note sur le cron format: */2 * * * *
// └─ Minutes (*/2 = toutes les 2 minutes)
//    └─ Heures (* = toutes les heures)
//       └─ Jour du mois (* = tous les jours)
//          └─ Mois (* = tous les mois)
//             └─ Jour de la semaine (* = tous les jours)
//
// Exemples d'autres fréquences :
// - "*/5 * * * *"  → Toutes les 5 minutes
// - "0 * * * *"    → Toutes les heures (à la minute 0)
// - "0 */2 * * *"  → Toutes les 2 heures
// - "*/1 * * * *"  → Toutes les minutes (attention à la limite de 125k invocations/mois sur le plan gratuit)
