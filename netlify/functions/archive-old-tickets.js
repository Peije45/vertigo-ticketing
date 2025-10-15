// netlify/functions/archive-old-tickets.js
// Archiver automatiquement les tickets résolus au-delà des 500 derniers
// ✅ Peut être appelé manuellement ou via un schedule

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Répondre aux preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Méthode non autorisée' })
    };
  }
  
  try {
    const body = JSON.parse(event.body || '{}');
    
    // Vérifier le secret admin
    if (body.admin_secret !== ADMIN_SECRET) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Secret invalide' })
      };
    }
    
    console.log('📦 Début de l\'archivage des anciens tickets...');
    
    const sql = neon(DATABASE_URL);
    
    // Étape 1 : Compter le nombre total de tickets résolus
    const totalResolved = await sql`
      SELECT COUNT(*) as count
      FROM tickets
      WHERE status = 'resolu'
        AND is_archived = false
    `;
    
    const totalCount = parseInt(totalResolved[0].count);
    console.log(`📊 ${totalCount} tickets résolus non archivés trouvés`);
    
    if (totalCount <= 500) {
      console.log('✅ Aucun ticket à archiver (moins de 500 tickets résolus)');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tickets_archived: 0,
          message: 'Aucun ticket à archiver (moins de 500 tickets résolus)',
          total_resolved: totalCount
        })
      };
    }
    
    // Étape 2 : Identifier les tickets à archiver (tous sauf les 500 derniers)
    const ticketsToArchive = totalCount - 500;
    console.log(`📦 ${ticketsToArchive} tickets vont être archivés`);
    
    // Étape 3 : Archiver les tickets (tous les résolus sauf les 500 plus récents)
    const archivedTickets = await sql`
      UPDATE tickets
      SET 
        is_archived = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT id
        FROM tickets
        WHERE status = 'resolu'
          AND is_archived = false
        ORDER BY closed_at DESC NULLS LAST, updated_at DESC
        OFFSET 500
      )
      RETURNING id, title, closed_at
    `;
    
    const archivedCount = archivedTickets.length;
    
    console.log(`✅ ${archivedCount} tickets archivés avec succès`);
    
    // Étape 4 : Logger l'archivage dans les activités
    for (const ticket of archivedTickets.slice(0, 10)) { // Logger seulement les 10 premiers pour éviter trop de logs
      try {
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
            'archived',
            'false',
            'true',
            'Ticket archivé automatiquement (au-delà des 500 derniers tickets résolus)'
          )
        `;
      } catch (err) {
        console.log(`Erreur log archivage ticket ${ticket.id}:`, err.message);
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        tickets_archived: archivedCount,
        total_resolved_before: totalCount,
        total_resolved_after: 500,
        message: `${archivedCount} ticket(s) archivé(s) avec succès`,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ Erreur archivage:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message,
        stack: error.stack
      })
    };
  }
};
