CREATE TABLE "simulation_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simulation_id" uuid NOT NULL,
	"day_id" uuid,
	"tick_id" uuid,
	"day" integer,
	"hour" integer,
	"agent_id" uuid,
	"kind" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"model_name" text,
	"prompt_hash" text,
	"tool_schema_hash" text,
	"artifact" jsonb,
	"artifact_uri" text,
	"is_redacted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simulation_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"seed" integer,
	"env_snapshot" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simulation_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"hour" integer NOT NULL,
	"tick_snapshot" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD COLUMN "tick_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_events" ADD COLUMN "tick_id" uuid;--> statement-breakpoint
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_day_id_simulation_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."simulation_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_tick_id_simulation_ticks_id_fk" FOREIGN KEY ("tick_id") REFERENCES "public"."simulation_ticks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_artifacts" ADD CONSTRAINT "simulation_artifacts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_days" ADD CONSTRAINT "simulation_days_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_ticks" ADD CONSTRAINT "simulation_ticks_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "simulation_artifacts_sim_idx" ON "simulation_artifacts" USING btree ("simulation_id");--> statement-breakpoint
CREATE INDEX "simulation_artifacts_sim_kind_idx" ON "simulation_artifacts" USING btree ("simulation_id","kind");--> statement-breakpoint
CREATE INDEX "simulation_artifacts_sim_day_idx" ON "simulation_artifacts" USING btree ("simulation_id","day");--> statement-breakpoint
CREATE INDEX "simulation_artifacts_sim_day_hour_idx" ON "simulation_artifacts" USING btree ("simulation_id","day","hour");--> statement-breakpoint
CREATE INDEX "simulation_artifacts_sim_agent_day_hour_idx" ON "simulation_artifacts" USING btree ("simulation_id","agent_id","day","hour");--> statement-breakpoint
CREATE INDEX "simulation_artifacts_day_id_idx" ON "simulation_artifacts" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "simulation_artifacts_tick_id_idx" ON "simulation_artifacts" USING btree ("tick_id");--> statement-breakpoint
CREATE UNIQUE INDEX "simulation_days_sim_day_idx" ON "simulation_days" USING btree ("simulation_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "simulation_ticks_sim_day_hour_idx" ON "simulation_ticks" USING btree ("simulation_id","day","hour");--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_tick_id_simulation_ticks_id_fk" FOREIGN KEY ("tick_id") REFERENCES "public"."simulation_ticks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_events" ADD CONSTRAINT "customer_events_tick_id_simulation_ticks_id_fk" FOREIGN KEY ("tick_id") REFERENCES "public"."simulation_ticks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_decisions_sim_agent_day_hour_idx" ON "agent_decisions" USING btree ("simulation_id","agent_id","day","hour");--> statement-breakpoint
CREATE INDEX "agent_decisions_sim_day_hour_idx" ON "agent_decisions" USING btree ("simulation_id","day","hour");--> statement-breakpoint
CREATE INDEX "agent_decisions_tick_idx" ON "agent_decisions" USING btree ("tick_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_events_sim_agent_day_hour_idx" ON "customer_events" USING btree ("simulation_id","agent_id","day","hour");--> statement-breakpoint
CREATE INDEX "customer_events_sim_day_hour_idx" ON "customer_events" USING btree ("simulation_id","day","hour");--> statement-breakpoint
CREATE INDEX "customer_events_tick_idx" ON "customer_events" USING btree ("tick_id");