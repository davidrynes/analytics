#!/usr/bin/env python3
"""
Test script pro ověření extrakce zdroje z konkrétní Novinky.cz stránky
"""

import asyncio
from playwright.async_api import async_playwright

async def test_single_page_extraction():
    """Otestuje extrakci z konkrétní stránky"""
    url = "https://www.novinky.cz/clanek/auto-skoda-poodhaluje-elektrickou-octavii-ostre-rezany-koncept-zaujme-i-netradicnimi-dvermi-40537197"
    expected_source = "Škoda Auto"  # Očekávaný zdroj
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        print(f"🔍 Testuji extrakci ze stránky:")
        print(f"   URL: {url}")
        print(f"   Očekávaný zdroj: {expected_source}")
        print()
        
        await page.goto(url)
        await page.wait_for_load_state('domcontentloaded')
        
        # Zkus odkliknout popup okno se souhlasem
        try:
            print("🔘 Hledám a odklikávám popup okno...")
            # Možné selektory pro popup tlačítka
            popup_selectors = [
                "button:has-text('Přijmout vše')",
                "button:has-text('Souhlasím')", 
                "button:has-text('Přijmout')",
                "button:has-text('OK')",
                "[data-testid='accept-all']",
                ".cookie-accept",
                ".consent-accept",
                "#accept-cookies"
            ]
            
            for selector in popup_selectors:
                try:
                    element = page.locator(selector)
                    if await element.count() > 0:
                        await element.first.click()
                        print(f"✅ Popup odkliknuto pomocí: {selector}")
                        await asyncio.sleep(1)  # Počkej na zavření popup
                        break
                except Exception as e:
                    continue
                    
        except Exception as e:
            print(f"⚠️ Chyba při odklikávání popup: {e}")
        
        await asyncio.sleep(3)  # Počkej na načtení po zavření popup
        
        # Zkopírujeme logiku z extract_video_info_fast.py
        video_info = None
        max_retries = 2
        
        for attempt in range(max_retries):
            try:
                print(f"🔄 Pokus {attempt + 1}/{max_retries}")
                
                # 1. Zkusme standardní selektory
                selectors_to_try = [
                    ".f_bK",                 # Specifický selektor pro Novinky.cz - "Video: Škoda Auto"
                    "figcaption .f_bK",      # Ještě specifičtější v figcaption
                    "span.f_bK",             # Přesný span s třídou f_bK
                    ".video-gallery__media-source",
                    ".article-author", 
                    ".author",
                    ".source",
                    ".video-source",
                    ".article-source",
                ]
                
                for selector in selectors_to_try:
                    try:
                        elements = page.locator(selector)
                        count = await elements.count()
                        print(f"🔍 Selektor '{selector}': {count} elementů")
                        
                        if count > 0:
                            for i in range(min(count, 3)):
                                element = elements.nth(i)
                                text = await element.text_content()
                                print(f"   Element {i}: '{text}'")
                                
                                if text and len(text.strip()) > 0:
                                    clean_text = text.strip()
                                    if 3 <= len(clean_text) <= 200:
                                        for prefix in ['Video:', 'Foto:', 'Zdroj:', 'Autor:']:
                                            if clean_text.startswith(prefix):
                                                clean_text = clean_text[len(prefix):].strip()
                                        
                                        if clean_text and len(clean_text) > 2:
                                            video_info = clean_text
                                            print(f"✅ Nalezen zdroj pomocí '{selector}': {clean_text}")
                                            break
                            if video_info:
                                break
                                
                    except Exception as e:
                        print(f"❌ Chyba při selektoru '{selector}': {e}")
                
                # 2. Hledání textu obsahujícího "Video:"
                if not video_info:
                    try:
                        print("🔍 Hledám text obsahující 'Video:'...")
                        video_elements = page.locator("*:has-text('Video:')")
                        count = await video_elements.count()
                        print(f"   Nalezeno {count} elementů s 'Video:'")
                        
                        for i in range(min(count, 10)):  # Zkus prvních 10
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
                
                # 3. Hledání známých zdrojů
                if not video_info:
                    try:
                        print("🔍 Hledám známé zdroje...")
                        common_sources = ['Škoda Auto', 'ČT24', 'ČTK', 'Reuters', 'AP', 'DPA', 'AFP']
                        for source in common_sources:
                            elements = page.locator(f"*:has-text('{source}')")
                            count = await elements.count()
                            if count > 0:
                                print(f"   Nalezeno {count} elementů s '{source}'")
                                element = elements.first
                                text = await element.text_content()
                                if text and source in text:
                                    lines = text.split('\n')
                                    for line in lines:
                                        if source in line and len(line.strip()) < 100:
                                            video_info = line.strip()
                                            print(f"✅ Nalezen zdroj podle klíčového slova '{source}': {video_info}")
                                            break
                                    if video_info:
                                        break
                            if video_info:
                                break
                    except Exception as e:
                        print(f"❌ Chyba při hledání známých zdrojů: {e}")
                
                if video_info and len(video_info) > 3:
                    break
                    
            except Exception as e:
                print(f"❌ Pokus {attempt + 1} selhal: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)
        
        print("\n" + "="*60)
        print("📊 VÝSLEDEK TESTU:")
        print(f"   Extrahovaný zdroj: {video_info or 'NENALEZEN'}")
        print(f"   Očekávaný zdroj: {expected_source}")
        
        if video_info:
            if expected_source.lower() in video_info.lower():
                print("✅ TEST ÚSPĚŠNÝ - Zdroj obsahuje očekávaný text!")
            else:
                print("⚠️ TEST ČÁSTEČNĚ ÚSPĚŠNÝ - Zdroj nalezen, ale neodpovídá očekávání")
        else:
            print("❌ TEST NEÚSPĚŠNÝ - Zdroj nenalezen")
        
        print("="*60)
        
        print("\nℹ️ Ponechávám browser otevřený pro manuální kontrolu...")
        print("Zkontrolujte stránku a najděte text 'Video: Škoda Auto'")
        print("Stiskněte Enter pro ukončení...")
        input()
        
        await browser.close()
        return video_info

if __name__ == "__main__":
    result = asyncio.run(test_single_page_extraction())
    print(f"\nFinální výsledek: {result}")
