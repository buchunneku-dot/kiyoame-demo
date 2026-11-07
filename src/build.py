import base64, pathlib, re

SRC = pathlib.Path(__file__).resolve().parent
PLAY = SRC.parent / 'play'


def script(name):
    if name == 'song/audio.js':
        data = base64.b64encode((SRC / 'song' / 'kiyoame-theme.mp3').read_bytes()).decode('ascii')
        code = f'window.KIYOAME_THEME_AUDIO = "{data}";'
    else:
        code = (SRC / name).read_text(encoding='utf-8')
    return '<script>\n' + code.replace('</script', '<' + chr(92) + '/script') + '\n</script>'


def page(source, target):
    text = (SRC / source).read_text(encoding='utf-8')
    text = re.sub(r'<script src="([^"]+)"( data-build)?></script>', lambda m: script(m.group(1)), text)
    head = '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n'
    if target != 'index.html':
        text = text.replace('content="trackless.html"', 'content="index.html"')
    out = PLAY / target
    out.write_text(head + text + '</html>\n', encoding='utf-8', newline='\n')
    print(out, out.stat().st_size)


def main():
    PLAY.mkdir(exist_ok=True)
    page('trackless.html', 'index.html')
    page('editor.html', 'editor.html')
    (PLAY / 'song').mkdir(exist_ok=True)
    for name in ('ams.mp3', 'kiyoame-theme.mp3'):
        (PLAY / 'song' / name).write_bytes((SRC / 'song' / name).read_bytes())


if __name__ == '__main__':
    main()
