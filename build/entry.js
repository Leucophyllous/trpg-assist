import "./setup.js";
import "bcdice/lib/bcdice/game_system/Cthulhu";
import "bcdice/lib/bcdice/game_system/Cthulhu7th";
import "bcdice/lib/bcdice/game_system/SwordWorld2_5";
import "bcdice/lib/bcdice/game_system/ShinobiGami";
import "bcdice/lib/bcdice/game_system/Emoklore";
import "bcdice/lib/bcdice/game_system/DiceBot";
import Loader from "bcdice/lib/loader/loader";

const loader = new Loader();
const wanted = ["Cthulhu", "Cthulhu7th", "SwordWorld2.5", "ShinobiGami", "Emoklore", "DiceBot"];

export function listSystems() {
  return loader.listLoadedGameSystems().filter(c => wanted.includes(c.ID)).map(c => ({ id: c.ID, name: c.NAME, help: c.HELP_MESSAGE }));
}

export function roll(id, command) {
  const C = loader.getGameSystemClass(id);
  const r = new C(command).eval();
  if (!r) return null;
  return { text: r.text, secret: !!r.secret, success: !!r.success, failure: !!r.failure, critical: !!r.critical, fumble: !!r.fumble };
}
