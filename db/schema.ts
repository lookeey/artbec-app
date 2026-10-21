// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,uniqueIndex,index} from 'drizzle-orm/sqlite-core';
export const changes=sqliteTable('finance_changes',{
 id:text('id').primaryKey(),
 data:text('data').notNull(),
 version:integer('version').notNull(),
 updatedAt:text('updated_at').notNull(),
});
export const noteChanges=sqliteTable('note_changes',{
 id:text('id').primaryKey(),
 data:text('data').notNull(),
 version:integer('version').notNull(),
 updatedAt:text('updated_at').notNull(),
});
export const fineChanges=sqliteTable('fine_changes',{
 id:text('id').primaryKey(),
 data:text('data').notNull(),
 version:integer('version').notNull(),
 updatedAt:text('updated_at').notNull(),
});
export const managementChanges=sqliteTable('management_changes',{
 id:text('id').primaryKey(),
 entity:text('entity').notNull(),
 data:text('data').notNull(),
 version:integer('version').notNull(),
 deleted:integer('deleted',{mode:'boolean'}).notNull().default(false),
 updatedAt:text('updated_at').notNull(),
});
export const operationChanges=sqliteTable('operation_changes',{
 id:text('id').primaryKey(),
 entity:text('entity').notNull(),
 data:text('data').notNull(),
 version:integer('version').notNull(),
 deleted:integer('deleted',{mode:'boolean'}).notNull().default(false),
 updatedAt:text('updated_at').notNull(),
});
export const auvoIntegration=sqliteTable('auvo_integration',{
 id:integer('id').primaryKey(),
 apiKeyCipher:text('api_key_cipher').notNull(),
 apiTokenCipher:text('api_token_cipher').notNull(),
 connected:integer('connected',{mode:'boolean'}).notNull().default(false),
 lastSyncAt:text('last_sync_at'),
 lastSyncStatus:text('last_sync_status'),
 updatedAt:text('updated_at').notNull(),
});
export const auvoUsers=sqliteTable('auvo_users',{
 auvoId:integer('auvo_id').primaryKey(),externalId:text('external_id'),name:text('name').notNull(),email:text('email'),jobPosition:text('job_position'),active:integer('active',{mode:'boolean'}).notNull().default(true),syncedAt:text('synced_at').notNull(),
});
export const auvoUserMappings=sqliteTable('auvo_user_mappings',{
 technicianId:text('technician_id').primaryKey(),auvoUserId:integer('auvo_user_id').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},table=>[uniqueIndex('auvo_user_mappings_user_unique').on(table.auvoUserId)]);
export const auvoCustomers=sqliteTable('auvo_customers',{
 auvoId:integer('auvo_id').primaryKey(),name:text('name').notNull(),syncedAt:text('synced_at').notNull(),
});
export const auvoTasks=sqliteTable('auvo_tasks',{
 auvoId:integer('auvo_id').primaryKey(),externalId:text('external_id'),auvoUserId:integer('auvo_user_id'),customerId:integer('customer_id'),taskType:integer('task_type'),taskTypeDescription:text('task_type_description'),creationDate:text('creation_date'),taskDate:text('task_date').notNull(),arrivalDate:text('arrival_date'),departureDate:text('departure_date'),durationMinutes:integer('duration_minutes'),priority:integer('priority'),finished:integer('finished',{mode:'boolean'}).notNull().default(false),taskStatus:integer('task_status').notNull(),syncedAt:text('synced_at').notNull(),
},table=>[index('auvo_tasks_date_idx').on(table.taskDate),index('auvo_tasks_user_idx').on(table.auvoUserId)]);
export const auvoSyncLogs=sqliteTable('auvo_sync_logs',{
 id:text('id').primaryKey(),startedAt:text('started_at').notNull(),finishedAt:text('finished_at'),status:text('status').notNull(),userCount:integer('user_count').notNull().default(0),customerCount:integer('customer_count').notNull().default(0),taskCount:integer('task_count').notNull().default(0),error:text('error'),
});
export const auvoWebhookEvents=sqliteTable('auvo_webhook_events',{
 id:text('id').primaryKey(),eventKey:text('event_key').notNull(),eventType:text('event_type'),action:text('action'),receivedAt:text('received_at').notNull(),processedAt:text('processed_at'),status:text('status').notNull(),
},table=>[uniqueIndex('auvo_webhook_events_key_unique').on(table.eventKey)]);
export const auvoAuditLog=sqliteTable('auvo_audit_log',{
 id:text('id').primaryKey(),actor:text('actor').notNull(),action:text('action').notNull(),metadata:text('metadata'),createdAt:text('created_at').notNull(),
});
export const appUsers=sqliteTable('app_users',{
 id:text('id').primaryKey(),username:text('username').notNull(),displayName:text('display_name').notNull(),passwordHash:text('password_hash').notNull(),passwordSalt:text('password_salt').notNull(),role:text('role').notNull(),permissions:text('permissions').notNull().default('[]'),active:integer('active',{mode:'boolean'}).notNull().default(true),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},table=>[uniqueIndex('app_users_username_unique').on(table.username)]);
export const appSessions=sqliteTable('app_sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull(),
},table=>[index('app_sessions_user_idx').on(table.userId),index('app_sessions_expiry_idx').on(table.expiresAt)]);
export const auditEvents=sqliteTable('audit_events',{
 sequence:integer('sequence').primaryKey({autoIncrement:true}),sourceTable:text('source_table').notNull(),recordId:text('record_id').notNull(),entity:text('entity').notNull(),action:text('action').notNull(),beforeData:text('before_data'),afterData:text('after_data'),actorId:text('actor_id').notNull(),actorName:text('actor_name').notNull(),at:text('at').notNull(),
},t=>[index('audit_record_idx').on(t.sourceTable,t.recordId,t.sequence),index('audit_at_idx').on(t.at,t.sequence)]);
export const auditOriginals=sqliteTable('audit_originals',{key:text('key').primaryKey(),data:text('data').notNull()});
export const auditContext=sqliteTable('audit_context',{id:integer('id').primaryKey(),actorId:text('actor_id').notNull(),actorName:text('actor_name').notNull()});
export const monthlyReviews=sqliteTable('monthly_reviews',{id:text('id').primaryKey(),period:text('period').notNull(),data:text('data').notNull(),version:integer('version').notNull(),updatedAt:text('updated_at').notNull()},t=>[index('monthly_reviews_period_idx').on(t.period)]);
export const safetyBackups=sqliteTable('safety_backups',{id:text('id').primaryKey(),objectKey:text('object_key').notNull(),createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull(),rowCount:integer('row_count').notNull(),tableCount:integer('table_count').notNull(),sha256:text('sha256').notNull(),size:integer('size').notNull()});
