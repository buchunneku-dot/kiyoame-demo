import base64, pathlib, re

SRC = pathlib.Path(__file__).resolve().parent
OUT = SRC.parent / 'play' / 'index.html'


def script(name):
    if name == 'song/audio.js':
        data = base64.b64encode((SRC / 'song' / 'kiyoame-theme.mp3').read_bytes()).decode('ascii')
        code = f'window.KIYOAME_THEME_AUDIO = "{data}";'
    else:
        code = (SRC / name).read_text(encoding='utf-8')
    return '<script>\n' + code.replace('</script', '<' + chr(92) + '/script') + '\n</script>'


def main():
    page = (SRC / 'trackless.html').read_text(encoding='utf-8')
    page = re.sub(r'<script src="([^"]+)"( data-build)?></script>', lambda m: script(m.group(1)), page)
    head = '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n'
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(head + page + '</html>\n', encoding='utf-8', newline='\n')
    (OUT.parent / 'song').mkdir(exist_ok=True)
    (OUT.parent / 'song' / 'ams.mp3').write_bytes((SRC / 'song' / 'ams.mp3').read_bytes())
    print(OUT, OUT.stat().st_size)


if __name__ == '__main__':
    main()
