"""Verify PNG differences stay inside the workshop; requires Pillow."""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

folder = Path(__file__).parent / 'screenshots'
cases = json.loads((folder / 'verification.json').read_text())['cases']
results = []
for device in ('pc', 'mobile', 'dusk'):
    for style in ('classic', 'v2'):
        ref = Image.open(folder / f'{device}-{style}-current.png').convert('RGB')
        for art in ('A', 'B', 'C'):
            case = next(c for c in cases if c['device'] == ('pc' if device == 'dusk' else device) and c['style'] == style and c['art'] == art)
            diff = ImageChops.difference(ref, Image.open(folder / f'{device}-{style}-{art}.png').convert('RGB'))
            changed = diff.getbbox()
            assert changed, f'{device}/{style}/{art}: no visible change'
            x, y, w, h = case['spriteBox']
            ImageDraw.Draw(diff).rectangle((x, y, x+w-1, y+h-1), fill=(0, 0, 0))
            assert diff.getbbox() is None, f'{device}/{style}/{art}: changed pixels outside workshop'
            results.append(dict(device=device, style=style, art=art, changedBox=changed, outsideWorkshopChanges=False))
(folder / 'image-verification.json').write_text(json.dumps(results, indent=2) + '\n')
print(f'{len(results)} PNG comparisons: all changes confined to workshop rectangle')
