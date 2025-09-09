#!/usr/bin/env python3
"""
Finální lokální test s přesně stejnou logikou jako hlavní extraktor
"""

import asyncio
from playwright.async_api import async_playwright

async def test_extraction_locally():
    url = "https://www.novinky.cz/clanek/auto-skoda-poodhaluje-elektrickou-octavii-ostre-rezany-koncept-zaujme-i-netradicnimi-dvermi-40537197"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        print(f"🔍 Testuji extrakci s novou logikou...")
        print(f"URL: {url}")
        print()
        
        # Použijeme přesně stejnou logiku jako v extract_video_info_fast.py
        max_retries = 3
        video_info = None
        
        for attempt in range(max_retries):
            try:
                print(f"🔄 Pokus {attempt + 1}/{max_retries}")
                print(f"🌐 Načítám stránku: {url}")
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                await page.wait_for_timeout(1000)
                print(f"✅ Stránka načtena úspěšně")
                
                # ROBUSTNÍ přijetí cookies/popup (pouze první pokus)
                if attempt == 0:
                    try:
                        print("🔘 Hledám a odklikávám popup okno...")
                        popup_handled = False
                        
                        # Strategie 1: Původní selektor + rozšíření
                        popup_selectors = [
                            "button[data-testid='cw-button-agree-with-ads']",
                            "button:has-text('Souhlasím')",
                            "button:has-text('Přijmout')",
                            "button:has-text('Přijmout vše')",
                            "button:has-text('Akceptuji')",
                            "button:has-text('OK')",
                            "[data-testid*='accept']",
                            "[data-testid*='consent']",
                            "[id*='accept']",
                            "[class*='accept']",
                            "[class*='consent']"
                        ]
                        
                        for selector in popup_selectors:
                            try:
                                elements = page.locator(selector)
                                count = await elements.count()
                                if count > 0:
                                    print(f"   Nalezeno {count} elementů pro '{selector}'")
                                    for i in range(count):
                                        element = elements.nth(i)
                                        if await element.is_visible():
                                            text = await element.text_content()
                                            print(f"      Klikám na: '{text}'")
                                            await element.click()
                                            print(f"✅ Popup odkliknuto: {selector}")
                                            popup_handled = True
                                            await page.wait_for_timeout(1000)
                                            break
                                if popup_handled:
                                    break
                            except Exception as e:
                                print(f"   Chyba u '{selector}': {e}")
                                continue
                        
                        if not popup_handled:
                            print("⚠️ Popup nebyl automaticky odkliknut")
                    except Exception as e:
                        print(f"❌ Chyba při popup handling: {e}")
                
                # ROZŠÍŘENÉ hledání zdrojů - více strategií
                video_info = None
                
                # 1. Hledání pomocí různých selektorů pro zdroj
                selectors_to_try = [
                    ".f_bK",                 # Specifický selektor pro Novinky.cz - "Video: Škoda Auto"
                    "figcaption .f_bK",      # Ještě specifičtější v figcaption
                    "span.f_bK",             # Přesný span s třídou f_bK
                    "span.f_bJ",             # Původní selektor - hlavní cíl
                    "div.ogm-container span.f_bJ",
                    "div.ogm-main-media__container span.f_bJ",
                    "p.c_br span.f_bJ",
                    "div.ogm-main-media__container span",
                    "*:has-text('Zdroj:')",
                    "*:has-text('Video:')",
                    "*:has-text('Foto:')",
                    "*:has-text('Autor:')",
                    "[class*='source']",
                    "[class*='author']",
                    "[class*='credit']",
                    "figcaption",
                    ".media-source",
                    ".video-source",
                    ".article-source",
                ]
                
                for selector in selectors_to_try:
                    try:
                        elements = page.locator(selector)
                        count = await elements.count()
                        print(f"🔍 Zkouším selektor '{selector}': nalezeno {count} elementů")
                        
                        if count > 0:
                            for i in range(min(count, 3)):  # Max 3 elementy
                                element = elements.nth(i)
                                text = await element.text_content()
                                print(f"   Element {i}: '{text}'")
                                
                                if text and len(text.strip()) > 0:
                                    # Vyčisti a validuj text
                                    clean_text = text.strip()
                                    
                                    # Proveř, jestli je to rozumná délka pro zdroj
                                    if 3 <= len(clean_text) <= 200:
                                        # Odstranění prefixů
                                        for prefix in ['Video:', 'Foto:', 'Zdroj:', 'Autor:']:
                                            if clean_text.startswith(prefix):
                                                clean_text = clean_text[len(prefix):].strip()
                                        
                                        if clean_text and len(clean_text) > 2:
                                            video_info = clean_text
                                            print(f"🎯 Nalezen zdroj pomocí '{selector}': {clean_text[:50]}...")
                                            break
                            
                            if video_info:
                                break
                                
                    except Exception as e:
                        print(f"❌ Chyba při zkoušení selektoru '{selector}': {e}")
                        continue
                
                # 2. Pokud stále nic, zkusme najít text obsahující "Video:"
                if not video_info:
                    try:
                        print("🔍 Hledám text obsahující 'Video:'...")
                        video_elements = page.locator("*:has-text('Video:')")
                        count = await video_elements.count()
                        print(f"   Nalezeno {count} elementů s 'Video:'")
                        
                        for i in range(min(count, 5)):
                            element = video_elements.nth(i)
                            text = await element.text_content()
                            print(f"   Element {i}: '{text[:100]}...'")
                            
                            if text and "Video:" in text:
                                lines = text.split('\n')
                                for line in lines:
                                    line = line.strip()
                                    if "Video:" in line and len(line) < 100:
                                        video_pos = line.find("Video:")
                                        if video_pos >= 0:
                                            source_part = line[video_pos + 6:].strip()
                                            if source_part and len(source_part) > 2:
                                                video_info = source_part
                                                print(f"✅ Nalezen zdroj z 'Video:': {video_info}")
                                                break
                                if video_info:
                                    break
                    except Exception as e:
                        print(f"❌ Chyba při hledání 'Video:': {e}")
                
                if video_info and len(video_info) > 3:
                    break
                    
            except Exception as e:
                print(f"❌ Pokus {attempt + 1} selhal: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)
        
        print("\n" + "="*60)
        print("📊 VÝSLEDEK LOKÁLNÍHO TESTU:")
        print(f"   Extrahovaný zdroj: {video_info or 'NENALEZEN'}")
        print(f"   Očekávaný zdroj: 'Škoda Auto'")
        
        if video_info:
            if "Škoda Auto" in video_info:
                print("✅ TEST ÚSPĚŠNÝ - Správný zdroj nalezen!")
            else:
                print("⚠️ TEST ČÁSTEČNĚ ÚSPĚŠNÝ - Zdroj nalezen, ale není to 'Škoda Auto'")
        else:
            print("❌ TEST NEÚSPĚŠNÝ - Žádný zdroj nenalezen")
        
        print("="*60)
        
        print(f"\n⏳ Ponechávám browser otevřený pro manuální kontrolu...")
        print(f"Zkontrolujte stránku a najděte 'Video: Škoda Auto'")
        print(f"Stiskněte Enter pro ukončení...")
        input()
        
        await browser.close()
        return video_info

if __name__ == "__main__":
    result = asyncio.run(test_extraction_locally())
    print(f"\nFinální výsledek: {result}")
