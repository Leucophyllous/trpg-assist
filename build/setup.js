import "bcdice/lib/base";
import { I18n } from "bcdice/lib/internal";
import j1 from "bcdice/lib/bcdice/i18n/Cthulhu.ja_jp.json";
import j2 from "bcdice/lib/bcdice/i18n/Emoklore.ja_jp.json";
import j3 from "bcdice/lib/bcdice/i18n/ShinobiGami.ja_jp.json";
import j4 from "bcdice/lib/bcdice/i18n/SwordWorld.ja_jp.json";
import j5 from "bcdice/lib/bcdice/i18n/SwordWorld2_0.ja_jp.json";
import j6 from "bcdice/lib/bcdice/i18n/SwordWorld2_5.ja_jp.json";
[j1, j2, j3, j4, j5, j6].forEach(j => I18n.$load_translation(JSON.stringify(j)));
