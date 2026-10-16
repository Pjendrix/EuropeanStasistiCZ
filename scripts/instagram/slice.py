import pathlib
from playwright.sync_api import sync_playwright
G=pathlib.Path('.').resolve(); OUT=pathlib.Path('../out')
names=['F1-mapa-eu','F2-mapa-cr','F3-vlajka-eu']
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg=b.new_page(viewport={'width':3104,'height':1350}); pg.goto(f'file://{G}/pano.svg'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT/'F0-panorama.png'))
    for i,n in enumerate(names):
        pg.screenshot(path=str(OUT/f'{n}.png'),clip={'x':i*1012,'y':0,'width':1080,'height':1350})
    b.close()
