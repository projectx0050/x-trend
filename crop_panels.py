from PIL import Image
import os, sys

src = r'C:\ClaudeCode\Xtrend\x-trend\Images\Feature 1.png'
out_dir = r'C:\ClaudeCode\Xtrend\x-trend\Images\cropped'
os.makedirs(out_dir, exist_ok=True)

try:
    img = Image.open(src)
    W, H = img.size
    print('Feature 1.png size: {}x{}'.format(W, H))

    cols, rows = 5, 2
    cw = W // cols
    rh = H // rows

    names = [
        'crop_caption', 'crop_rewriter', 'crop_hashtag', 'crop_reviews', 'crop_email',
        'crop_proposals', 'crop_brandvoice', 'crop_built_for', 'crop_chrome', 'crop_pricing'
    ]

    for i, name in enumerate(names):
        col = i % cols
        row = i // cols
        box = (col * cw, row * rh, (col + 1) * cw, (row + 1) * rh)
        panel = img.crop(box)
        out_path = os.path.join(out_dir, name + '.png')
        panel.save(out_path, 'PNG')
        print('  Saved {}.png  box={}'.format(name, box))

    print('Done. Output dir: ' + out_dir)
except Exception as e:
    print('ERROR: ' + str(e))
    sys.exit(1)
