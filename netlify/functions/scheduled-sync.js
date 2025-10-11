// netlify/functions/scheduled-sync.js
// Synchronisation automatique COMPLÈTE des tickets toutes les X minutes
// ✅ INCLUT : Détection et clôture des tickets disparus de Discord

const { neon } = require('@neondatabase/serverless');
const { schedule } = require('@netlify/functions');

// Mapping des catégories Discord → Noms en BDD
const CATEGORY_MAPPINGS = {
  "1291802650697793608": "Claim",
  "1385590330660884530": "Parrainage",
  "1385592028754087996": "RP",
  "1385591177138671737": "Dossier",
  "1385592373886844948": "Bugs",
  "1385592539247153243": "Questions"
};

// Fonction principale de synchronisation
const syncTickets = async () => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const DISCORD_SERVER_ID = process.env.DISCORD_SERVER_ID || '1288511254369013831';
  
  console.log('🔄 Début de la synchronisation automatique complète...');
  
  try {
    const sql = neon(DATABASE_URL);
    
    // ============================================
    // ÉTAPE 1 : Récupérer TOUS les channels Discord du serveur
    // ============================================
    const channelsResponse = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_SERVER_ID}/channels`,
      {
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!channelsResponse.ok) {
      throw new Error(`Erreur Discord API: ${channelsResponse.status}`);
    }
    
    const allChannels = await channelsResponse.json();
    
    // Filtrer uniquement les channels dans les catégories de ticketing
    const categoryIds = Object.keys(CATEGORY_MAPPINGS);
    const ticketChannels = allChannels.filter(ch => 
      ch.parent_id && categoryIds.includes(ch.parent_id) && ch.type === 0 // Type 0 = text channel
    );
    
    console.log(`📋 Trouvé ${ticketChannels.length} channels de tickets sur Discord`);
    
    // ============================================
    // ÉTAPE 2 : Récupérer les tickets existants dans la BDD
    // ============================================
    const existingTickets = await sql`
      SELECT 
        discord_channel_id, 
        id, 
        unread_count, 
        assigned_to_user_id,
        status,
        title,
        category_id
      FROM tickets
      WHERE status != 'resolu'
    `;
    
    const existingChannelIds = new Set(existingTickets.map(t => t.discord_channel_id));
    console.log(`💾 ${existingTickets.length} tickets actifs en BDD`);
    
    // ============================================
    // ÉTAPE 3 : Identifier les nouveaux tickets à créer
    // ============================================
    const newTicketChannels = ticketChannels.filter(ch => !existingChannelIds.has(ch.id));
    console.log(`🆕 ${newTicketChannels.length} nouveaux tickets à créer`);
    
    let ticketsCreated = 0;
    let ticketsUpdated = 0;
    let ticketsClosed = 0;
    let assignationsDetected = 0;
    let categoriesChanged = 0;
    let newMessagesCount = 0;
    
    // ============================================
    // ÉTAPE 4 : Créer les nouveaux tickets dans la BDD
    // ============================================
    for (const channel of newTicketChannels) {
      try {
        // Trouver la catégorie BDD
        const categoryName = CATEGORY_MAPPINGS[channel.parent_id];
        const categories = await sql`
          SELECT id FROM categories 
          WHERE name ILIKE ${categoryName}
          LIMIT 1
        `;
        const category_id = categories.length > 0 ? categories[0].id : null;
        
        // Récupérer les messages du channel pour trouver le créateur
        const messagesResponse = await fetch(
          `https://discord.com/api/v10/channels/${channel.id}/messages?limit=100`,
          {
            headers: {
              'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const messages = messagesResponse.ok ? await messagesResponse.json() : [];
        
        // Trouver le créateur (premier message non-bot)
        let creator = null;
        if (messages.length > 0) {
          const firstUserMessage = messages.reverse().find(m => !m.author.bot);
          if (firstUserMessage) {
            creator = firstUserMessage.author;
          }
        }
        
        // Parser le nom du ticket pour détecter l'assignation
        const ticketInfo = parseTicketName(channel.name);
        
        // Trouver l'utilisateur staff assigné si le ticket a été claimé
        let assignedUserId = null;
        if (ticketInfo.staffName) {
          const staffUsers = await sql`
            SELECT id, discord_username, discord_global_name FROM users 
            WHERE (LOWER(discord_username) = LOWER(${ticketInfo.staffName})
               OR LOWER(discord_global_name) = LOWER(${ticketInfo.staffName}))
              AND can_access_dashboard = true
            LIMIT 1
          `;
          
          if (staffUsers.length > 0) {
            assignedUserId = staffUsers[0].id;
            console.log(`👤 Nouveau ticket claimé détecté: ${channel.name} → ${staffUsers[0].discord_username}`);
          } else {
            console.log(`⚠️ Staff "${ticketInfo.staffName}" non trouvé dans la BDD`);
          }
        }
        
        // Déterminer le statut
        const status = assignedUserId ? 'en_cours' : 'nouveau';
        
        // Priorité NULL par défaut - à attribuer manuellement
        const priority = null;
        
        // Date de création (à partir du snowflake Discord)
        const createdAt = new Date((parseInt(channel.id) / 4194304) + 1420070400000).toISOString();
        
        // Créer le ticket dans la BDD
        const ticketResult = await sql`
          INSERT INTO tickets (
            discord_channel_id,
            discord_server_id,
            title,
            category_id,
            status,
            priority,
            created_by_discord_id,
            created_by_username,
            created_by_avatar_url,
            assigned_to_user_id,
            assigned_at,
            assigned_by_user_id,
            is_unread,
            unread_count,
            created_at,
            last_message_at
          ) VALUES (
            ${channel.id},
            ${DISCORD_SERVER_ID},
            ${channel.name},
            ${category_id},
            ${status},
            ${priority},
            ${creator?.id || 'unknown'},
            ${ticketInfo.username || creator?.username || 'Utilisateur inconnu'},
            ${creator?.avatar ? `https://cdn.discordapp.com/avatars/${creator.id}/${creator.avatar}.png` : null},
            ${assignedUserId},
            ${assignedUserId ? new Date().toISOString() : null},
            ${assignedUserId},
            true,
            ${messages.length},
            ${createdAt},
            ${messages.length > 0 ? new Date(messages[0].timestamp).toISOString() : createdAt}
          )
          RETURNING id
        `;
        
        const ticketId = ticketResult[0].id;
        ticketsCreated++;
        
        // Logger l'assignation si le ticket est créé déjà assigné
        if (assignedUserId) {
          await sql`
            INSERT INTO ticket_activity_log (
              ticket_id,
              user_id,
              action_type,
              new_value,
              comment
            ) VALUES (
              ${ticketId},
              ${assignedUserId},
              'assigned',
              ${assignedUserId},
              'Ticket créé déjà assigné (détecté via nom du channel)'
            )
          `;
          assignationsDetected++;
        }
        
        // Insérer les messages du nouveau ticket
        for (const msg of messages) {
          if (msg.content && !msg.author.bot) {
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
                  ${ticketId},
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
        }
        
        console.log(`✅ Ticket créé: ${channel.name} (${messages.length} messages)`);
        
      } catch (error) {
        console.error(`❌ Erreur création ticket ${channel.id}:`, error.message);
      }
    }
    
    // ============================================
    // ÉTAPE 5 : Détecter et clôturer les tickets disparus de Discord
    // ============================================
    console.log(`🔍 Détection des tickets disparus de Discord...`);
    
    // Créer un Set des IDs de channels Discord actuellement présents
    const currentDiscordChannelIds = new Set(ticketChannels.map(ch => ch.id));
    
    // Trouver les tickets en BDD qui n'existent plus sur Discord
    const disappearedTickets = existingTickets.filter(ticket => 
      !currentDiscordChannelIds.has(ticket.discord_channel_id)
    );
    
    if (disappearedTickets.length > 0) {
      console.log(`🚪 ${disappearedTickets.length} tickets ont disparu de Discord et seront clôturés`);
      
      for (const ticket of disappearedTickets) {
        try {
          console.log(`🔒 Clôture du ticket "${ticket.title}" (ID: ${ticket.id}) - Channel Discord ${ticket.discord_channel_id} introuvable`);
          
          // Marquer le ticket comme résolu/clôturé
          await sql`
            UPDATE tickets 
            SET 
              status = 'resolu',
              closed_at = CURRENT_TIMESTAMP,
              closed_by_user_id = NULL,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${ticket.id}
          `;
          
          // Logger la clôture automatique
          await sql`
            INSERT INTO ticket_activity_log (
              ticket_id,
              user_id,
              action_type,
              old_value,
              new_value,
              comment
            ) VALUES (
              ${ticket.id},
              NULL,
              'status_changed',
              ${ticket.status},
              'resolu',
              'Ticket clôturé automatiquement : channel Discord supprimé ou déplacé'
            )
          `;
          
          ticketsClosed++;
          
        } catch (error) {
          console.error(`❌ Erreur clôture ticket ${ticket.id}:`, error.message);
        }
      }
    } else {
      console.log(`✅ Aucun ticket disparu détecté`);
    }
    
    // ============================================
    // ÉTAPE 6 : Synchroniser les tickets existants (toujours présents)
    // ============================================
    console.log(`🔄 Synchronisation des tickets existants (changements de catégorie, assignations, messages)...`);
    
    // Filtrer pour ne synchroniser que les tickets toujours présents sur Discord
    const activeTickets = existingTickets.filter(ticket => 
      currentDiscordChannelIds.has(ticket.discord_channel_id)
    );
    
    for (const ticket of activeTickets) {
      try {
        // ============================================
        // 6.1 : Récupérer les infos actuelles du channel Discord
        // ============================================
        const channelResponse = await fetch(
          `https://discord.com/api/v10/channels/${ticket.discord_channel_id}`,
          {
            headers: {
              'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (!channelResponse.ok) {
          console.log(`⚠️ Channel ${ticket.discord_channel_id} inaccessible (peut-être supprimé)`);
          continue;
        }
        
        const channel = await channelResponse.json();
        
        // ============================================
        // 6.2 : Vérifier si la catégorie Discord a changé
        // ============================================
        const currentCategoryDiscordId = channel.parent_id;
        const currentCategoryName = CATEGORY_MAPPINGS[currentCategoryDiscordId];
        
        // Récupérer l'ID de la catégorie BDD correspondante
        let newCategoryId = null;
        if (currentCategoryName) {
          const categories = await sql`
            SELECT id FROM categories 
            WHERE name ILIKE ${currentCategoryName}
            LIMIT 1
          `;
          newCategoryId = categories.length > 0 ? categories[0].id : null;
        }
        
        // Mettre à jour la catégorie si elle a changé
        if (newCategoryId && newCategoryId !== ticket.category_id) {
          console.log(`📂 Changement de catégorie détecté pour ticket "${ticket.title}": Catégorie ${ticket.category_id} → ${newCategoryId} (${currentCategoryName})`);
          
          await sql`
            UPDATE tickets 
            SET 
              category_id = ${newCategoryId},
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${ticket.id}
          `;
          
          // Logger le changement de catégorie
          await sql`
            INSERT INTO ticket_activity_log (
              ticket_id,
              user_id,
              action_type,
              old_value,
              new_value,
              comment
            ) VALUES (
              ${ticket.id},
              NULL,
              'category_changed',
              ${ticket.category_id},
              ${newCategoryId},
              ${`Catégorie changée automatiquement vers: ${currentCategoryName}`}
            )
          `;
          
          categoriesChanged++;
        }
        
        // ============================================
        // 6.3 : Détecter si le ticket a été claimé/assigné
        // ============================================
        const ticketInfo = parseTicketName(channel.name);
        let currentAssignedUserId = null;
        
        // Si un staff est détecté dans le nom
        if (ticketInfo.staffName) {
          // Chercher l'utilisateur dans la BDD
          const staffUsers = await sql`
            SELECT id, discord_username, discord_global_name 
            FROM users 
            WHERE (LOWER(discord_username) = LOWER(${ticketInfo.staffName})
               OR LOWER(discord_global_name) = LOWER(${ticketInfo.staffName}))
              AND can_access_dashboard = true
            LIMIT 1
          `;
          
          if (staffUsers.length > 0) {
            currentAssignedUserId = staffUsers[0].id;
            
            // Vérifier si c'est une nouvelle assignation
            if (currentAssignedUserId !== ticket.assigned_to_user_id) {
              console.log(`👤 Assignation détectée: Ticket "${ticket.title}" → ${staffUsers[0].discord_username}`);
              
              // Mettre à jour l'assignation dans la BDD
              await sql`
                UPDATE tickets 
                SET 
                  assigned_to_user_id = ${currentAssignedUserId},
                  assigned_at = CURRENT_TIMESTAMP,
                  assigned_by_user_id = ${currentAssignedUserId},
                  status = CASE 
                    WHEN status = 'nouveau' THEN 'en_cours'
                    ELSE status
                  END,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ${ticket.id}
              `;
              
              // Logger l'assignation
              await sql`
                INSERT INTO ticket_activity_log (
                  ticket_id,
                  user_id,
                  action_type,
                  new_value,
                  comment
                ) VALUES (
                  ${ticket.id},
                  ${currentAssignedUserId},
                  'assigned',
                  ${currentAssignedUserId},
                  'Assignation détectée via sync automatique (changement nom channel)'
                )
              `;
              
              assignationsDetected++;
            }
          } else {
            console.log(`⚠️ Staff "${ticketInfo.staffName}" non trouvé dans la BDD pour ticket ${ticket.discord_channel_id}`);
          }
        }
        
        // ============================================
        // 6.4 : Mettre à jour le titre si changé
        // ============================================
        if (channel.name !== ticket.title) {
          await sql`
            UPDATE tickets 
            SET 
              title = ${channel.name},
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${ticket.id}
          `;
          console.log(`📝 Titre mis à jour: "${ticket.title}" → "${channel.name}"`);
        }
        
        // ============================================
        // 6.5 : Synchroniser les nouveaux messages
        // ============================================
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
          console.log(`⚠️ Impossible de récupérer les messages du channel ${ticket.discord_channel_id}`);
          continue;
        }
        
        const messages = await messagesResponse.json();
        
        // Filtrer les messages de bots et vides
        const newMessages = messages.filter(m => 
          !m.author.bot && 
          m.content && 
          m.content.length > 0
        );
        
        if (newMessages.length === 0 && !currentAssignedUserId && newCategoryId === ticket.category_id) {
          continue; // Pas de changements
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
        
        // Mettre à jour le ticket si nouveaux messages
        if (newMessages.length > 0) {
          await sql`
            UPDATE tickets 
            SET 
              is_unread = true,
              unread_count = unread_count + ${newMessages.length},
              has_new_messages = true,
              last_message_at = ${new Date(newMessages[0].timestamp).toISOString()},
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${ticket.id}
          `;
          ticketsUpdated++;
        }
        
      } catch (error) {
        console.error(`❌ Erreur sync ticket ${ticket.id}:`, error.message);
      }
    }
    
    // ============================================
    // ÉTAPE 7 : Résumé et retour
    // ============================================
    const summary = {
      success: true,
      tickets_found_on_discord: ticketChannels.length,
      tickets_in_database: existingTickets.length,
      new_tickets_created: ticketsCreated,
      existing_tickets_updated: ticketsUpdated,
      tickets_closed_automatically: ticketsClosed,
      assignations_detected: assignationsDetected,
      categories_changed: categoriesChanged,
      new_messages_synced: newMessagesCount,
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Synchronisation terminée:');
    console.log(`   - ${ticketsCreated} nouveaux tickets créés`);
    console.log(`   - ${ticketsUpdated} tickets existants mis à jour`);
    console.log(`   - ${ticketsClosed} tickets clôturés automatiquement`);
    console.log(`   - ${assignationsDetected} assignations détectées`);
    console.log(`   - ${categoriesChanged} changements de catégorie détectés`);
    console.log(`   - ${newMessagesCount} nouveaux messages synchronisés`);
    
    return summary;
    
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    throw error;
  }
};

// ============================================
// FONCTION UTILITAIRE : Parser le nom du ticket
// ============================================
function parseTicketName(name) {
  // Formats attendus:
  // - "001-username" (pas claimé)
  // - "001-staffname-username" (claimé)
  // - Parfois avec emojis ou caractères spéciaux
  
  // Nettoyer le nom (enlever les emojis courants)
  const cleanName = name.replace(/[🔴🟠🟢⚠️❓]/g, '').trim();
  
  const parts = cleanName.split('-');
  
  if (parts.length === 2) {
    // Format: "001-username" (pas claimé)
    return {
      number: parts[0],
      username: parts[1],
      staffName: null
    };
  } else if (parts.length >= 3) {
    // Format: "001-staffname-username" (claimé)
    return {
      number: parts[0],
      staffName: parts[1],
      username: parts.slice(2).join('-')
    };
  }
  
  // Format non reconnu, retourner le nom complet comme username
  return {
    number: null,
    username: cleanName,
    staffName: null
  };
}

// ============================================
// EXPORT - Fonction schedulée
// ============================================
// S'exécute automatiquement toutes les 2 minutes
exports.handler = schedule('*/2 * * * *', syncTickets);
