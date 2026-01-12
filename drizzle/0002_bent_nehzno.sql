ALTER TABLE "agent_decisions" ALTER COLUMN "tick_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_events" ALTER COLUMN "tick_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_sim_model_idx" ON "agents" USING btree ("simulation_id","model_name");--> statement-breakpoint
CREATE INDEX "agents_sim_idx" ON "agents" USING btree ("simulation_id");