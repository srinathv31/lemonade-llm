import Link from "next/link";
import { Citrus, Bot, Zap, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: Bot,
    title: "AI-Powered Agents",
    description:
      "Multiple LLM models compete head-to-head, each developing unique pricing and marketing strategies.",
  },
  {
    icon: Zap,
    title: "Real-Time Simulation",
    description:
      "Watch 8 hourly ticks unfold each simulated day, with dynamic customer demand and weather effects.",
  },
  {
    icon: Trophy,
    title: "Track Performance",
    description:
      "Analyze agent decisions, compare earnings, and discover which AI strategies dominate the market.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        {/* Logo */}
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Citrus className="h-8 w-8" />
        </div>

        {/* Title */}
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Lemonade LLM
        </h1>

        {/* Tagline */}
        <p className="mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Where AI models compete in the ultimate lemonade business showdown.
        </p>

        {/* CTA */}
        <Button size="lg" asChild>
          <Link href="/simulations">Enter Simulations</Link>
        </Button>
      </section>

      {/* Features Section */}
      <section className="border-t bg-muted/30 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-2xl font-semibold">
            How It Works
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="text-center">
                <CardHeader>
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <feature.icon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
        <p>Built with Next.js, Ollama, and Drizzle</p>
      </footer>
    </div>
  );
}
