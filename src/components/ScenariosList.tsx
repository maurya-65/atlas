import { scenarios } from "./derive";
import { SearchIcon } from "./icons";
import ScenarioCard from "./ScenarioCard";
import { Card, CardContent, Empty } from "./ui";
import type { ViewProps } from "./viewProps";

/** Every what-if and sector research Atlas has run, newest first. */
export default function ScenariosList({ atlas }: ViewProps) {
  const list = scenarios(atlas.state.messages);
  if (list.length === 0) {
    return (
      <Card>
        <CardContent>
          <Empty icon={<SearchIcon />} title="No what-if yet.">
            A what-if takes an event, like “What if Taiwan blocks chip exports?”, and traces how it could reach the stocks you own.{" "}
            <a href="#research/new" className="font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white">
              Try one
            </a>
            .
          </Empty>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {list.map((m) => (
        <ScenarioCard key={m.id} m={m} s={m.scenario!} onChoose={atlas.actions.choose} disabled={Boolean(atlas.choosing)} />
      ))}
    </div>
  );
}
