
CREATE TABLE `audit_context` (
	`id` integer PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_table` text NOT NULL,
	`record_id` text NOT NULL,
	`entity` text NOT NULL,
	`action` text NOT NULL,
	`before_data` text,
	`after_data` text,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_record_idx` ON `audit_events` (`source_table`,`record_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_events` (`at`,`sequence`);--> statement-breakpoint
CREATE TABLE `audit_originals` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monthly_reviews_period_idx` ON `monthly_reviews` (`period`);--> statement-breakpoint
CREATE TABLE `safety_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`row_count` integer NOT NULL,
	`table_count` integer NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER finance_changes_audit_insert AFTER INSERT ON finance_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('finance_changes',NEW.id,'finance',CASE WHEN 0 THEN 'deleted' WHEN (SELECT data FROM audit_originals WHERE key='finance_changes:'||NEW.id) IS NOT NULL THEN 'updated' ELSE 'created' END,(SELECT data FROM audit_originals WHERE key='finance_changes:'||NEW.id),NEW.data,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER finance_changes_audit_update AFTER UPDATE ON finance_changes WHEN OLD.data IS NOT NEW.data BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('finance_changes',NEW.id,'finance','updated',OLD.data,NEW.data,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER finance_changes_audit_delete BEFORE DELETE ON finance_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('finance_changes',OLD.id,'finance','deleted',OLD.data,NULL,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER note_changes_audit_insert AFTER INSERT ON note_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('note_changes',NEW.id,'note',CASE WHEN 0 THEN 'deleted' WHEN (SELECT data FROM audit_originals WHERE key='note_changes:'||NEW.id) IS NOT NULL THEN 'updated' ELSE 'created' END,(SELECT data FROM audit_originals WHERE key='note_changes:'||NEW.id),NEW.data,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER note_changes_audit_update AFTER UPDATE ON note_changes WHEN OLD.data IS NOT NEW.data BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('note_changes',NEW.id,'note','updated',OLD.data,NEW.data,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER note_changes_audit_delete BEFORE DELETE ON note_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('note_changes',OLD.id,'note','deleted',OLD.data,NULL,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER fine_changes_audit_insert AFTER INSERT ON fine_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('fine_changes',NEW.id,'fine',CASE WHEN 0 THEN 'deleted' WHEN (SELECT data FROM audit_originals WHERE key='fine_changes:'||NEW.id) IS NOT NULL THEN 'updated' ELSE 'created' END,(SELECT data FROM audit_originals WHERE key='fine_changes:'||NEW.id),NEW.data,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER fine_changes_audit_update AFTER UPDATE ON fine_changes WHEN OLD.data IS NOT NEW.data BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('fine_changes',NEW.id,'fine','updated',OLD.data,NEW.data,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER fine_changes_audit_delete BEFORE DELETE ON fine_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('fine_changes',OLD.id,'fine','deleted',OLD.data,NULL,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER management_changes_audit_insert AFTER INSERT ON management_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('management_changes',NEW.id,NEW.entity,CASE WHEN NEW.deleted=1 THEN 'deleted' WHEN (SELECT data FROM audit_originals WHERE key='management_changes:'||NEW.id) IS NOT NULL THEN 'updated' ELSE 'created' END,(SELECT data FROM audit_originals WHERE key='management_changes:'||NEW.id),CASE WHEN NEW.deleted=1 THEN NULL ELSE NEW.data END,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER management_changes_audit_update AFTER UPDATE ON management_changes WHEN OLD.data IS NOT NEW.data OR OLD.deleted IS NOT NEW.deleted BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('management_changes',NEW.id,NEW.entity,CASE WHEN OLD.deleted=0 AND NEW.deleted=1 THEN 'deleted' WHEN OLD.deleted=1 AND NEW.deleted=0 THEN 'restored' ELSE 'updated' END,CASE WHEN OLD.data='{}' THEN COALESCE((SELECT data FROM audit_originals WHERE key='management_changes:'||NEW.id),OLD.data) ELSE OLD.data END,CASE WHEN NEW.deleted=1 THEN NULL ELSE NEW.data END,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER management_changes_audit_delete BEFORE DELETE ON management_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('management_changes',OLD.id,OLD.entity,'deleted',OLD.data,NULL,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER operation_changes_audit_insert AFTER INSERT ON operation_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('operation_changes',NEW.id,NEW.entity,CASE WHEN NEW.deleted=1 THEN 'deleted' WHEN (SELECT data FROM audit_originals WHERE key='operation_changes:'||NEW.id) IS NOT NULL THEN 'updated' ELSE 'created' END,(SELECT data FROM audit_originals WHERE key='operation_changes:'||NEW.id),CASE WHEN NEW.deleted=1 THEN NULL ELSE NEW.data END,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER operation_changes_audit_update AFTER UPDATE ON operation_changes WHEN OLD.data IS NOT NEW.data OR OLD.deleted IS NOT NEW.deleted BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('operation_changes',NEW.id,NEW.entity,CASE WHEN OLD.deleted=0 AND NEW.deleted=1 THEN 'deleted' WHEN OLD.deleted=1 AND NEW.deleted=0 THEN 'restored' ELSE 'updated' END,CASE WHEN OLD.data='{}' THEN COALESCE((SELECT data FROM audit_originals WHERE key='operation_changes:'||NEW.id),OLD.data) ELSE OLD.data END,CASE WHEN NEW.deleted=1 THEN NULL ELSE NEW.data END,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER operation_changes_audit_delete BEFORE DELETE ON operation_changes BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('operation_changes',OLD.id,OLD.entity,'deleted',OLD.data,NULL,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER monthly_reviews_audit_insert AFTER INSERT ON monthly_reviews BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('monthly_reviews',NEW.id,'monthlyReview',CASE WHEN 0 THEN 'deleted' WHEN (SELECT data FROM audit_originals WHERE key='monthly_reviews:'||NEW.id) IS NOT NULL THEN 'updated' ELSE 'created' END,(SELECT data FROM audit_originals WHERE key='monthly_reviews:'||NEW.id),NEW.data,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER monthly_reviews_audit_update AFTER UPDATE ON monthly_reviews WHEN OLD.data IS NOT NEW.data BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('monthly_reviews',NEW.id,'monthlyReview','updated',OLD.data,NEW.data,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER monthly_reviews_audit_delete BEFORE DELETE ON monthly_reviews BEGIN INSERT INTO audit_events(source_table,record_id,entity,action,before_data,after_data,actor_id,actor_name,at) VALUES ('monthly_reviews',OLD.id,'monthlyReview','deleted',OLD.data,NULL,COALESCE((SELECT actor_id FROM audit_context WHERE id=1),'system'),COALESCE((SELECT actor_name FROM audit_context WHERE id=1),'Sistema'),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit history is immutable'); END;
