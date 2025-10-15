// netlify/functions/archive-old-tickets.js
// Archiver manuellement les tickets résolus
// Logique : Dès qu'on atteint 480 tickets résolus, archiver les 100 plus anciens
// ✅ Peut être appelé manuellement avec admin_secret

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
    
    console.log('📦 [MANUEL] Début de l\'archivage manuel...');
    
    const sql = neon(DATABASE_URL);
    
    // Étape 1 : Compter le nombre total de tickets résolus non archivés
    const totalResolved = await sql`
      SELECT COUNT(*) as count
      FROM tickets
      WHERE status = 'resolu'
        AND is_archived = false
    `;
    
    const totalCount = parseInt(totalResolved[0].count);
    console.log(`📊 ${totalCount} tickets résolus non archivés trouvés`);
    
    // Étape 2 : Vérifier si on doit archiver (seuil : 480 tickets)
    if (totalCount < 480) {
      console.log(`✅ Aucun archivage nécessaire (${totalCount} < 480)`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tickets_archived: 0,
          message: `Aucun archivage nécessaire (${totalCount} tickets résolus, seuil : 480)`,
          total_resolved: totalCount,
          threshold: 480
        })
      };
    }
    
    // Étape 3 : Archiver les 100 tickets résolus les plus anciens
    console.log(`⚠️ Seuil atteint (${totalCount} >= 480) → Archivage de 100 tickets les plus anciens`);
    
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
        ORDER BY closed_at ASC NULLS LAST, updated_at ASC
        LIMIT 100
      )
      RETURNING id, title, closed_at
    `;
    
    const archivedCount = archivedTickets.length;
    const remainingCount = totalCount - archivedCount;
    
    console.log(`✅ ${archivedCount} tickets archivés avec succès`);
    console.log(`📊 ${remainingCount} tickets résolus restants en base`);
    
    // Étape 4 : Logger l'archivage (seulement pour les 10 premiers)
    for (const ticket of archivedTickets.slice(0, 10)) {
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
            'Ticket archivé manuellement (seuil de 480 atteint - archivage des 100 plus anciens)'
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
        total_resolved_after: remainingCount,
        threshold: 480,
        archive_batch_size: 100,
        message: `${archivedCount} ticket(s) archivé(s) avec succès`,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ Erreur archivage manuel:', error);
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
