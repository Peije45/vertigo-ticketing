// netlify/functions/scheduled-archive.js
// Archivage automatique quotidien des tickets résolus
// S'exécute tous les jours à 2h du matin UTC
// Logique : Dès qu'on atteint 480 tickets résolus, archiver les 100 plus anciens

const { neon } = require('@neondatabase/serverless');
const { schedule } = require('@netlify/functions');

const archiveOldTickets = async () => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  
  console.log('🕛 [SCHEDULED 2AM] Début de l\'archivage automatique quotidien...');
  
  try {
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
        success: true,
        tickets_archived: 0,
        message: `Aucun archivage nécessaire (${totalCount} tickets résolus, seuil : 480)`,
        total_resolved: totalCount
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
            'Ticket archivé automatiquement (seuil de 480 atteint - archivage des 100 plus anciens)'
          )
        `;
      } catch (err) {
        console.log(`Erreur log archivage ticket ${ticket.id}:`, err.message);
      }
    }
    
    const summary = {
      success: true,
      tickets_archived: archivedCount,
      total_resolved_before: totalCount,
      total_resolved_after: remainingCount,
      threshold: 480,
      archive_batch_size: 100,
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Archivage automatique terminé:', summary);
    return summary;
    
  } catch (error) {
    console.error('❌ Erreur archivage automatique:', error);
    throw error;
  }
};

// S'exécute tous les jours à 2h du matin UTC
exports.handler = schedule('0 2 * * *', archiveOldTickets);
