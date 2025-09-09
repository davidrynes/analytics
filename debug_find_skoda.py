#!/usr/bin/env python3
"""
Debug script to find all text containing "Škoda" on the page
"""

import asyncio
from playwright.async_api import async_playwright

async def find_skoda_text():
    url = "https://www.novinky.cz/clanek/auto-skoda-poodhaluje-elektrickou-octavii-ostre-rezany-koncept-zaujme-i-netradicnimi-dvermi-40537197"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        print(f"🔍 Hledám text obsahující 'Škoda' na stránce...")
        await page.goto(url)
        await page.wait_for_load_state('domcontentloaded')
        await asyncio.sleep(3)  # Počkej na načtení
        
        # 1. Najdi všechny elementy obsahující "Škoda"
        try:
            elements = page.locator("*:has-text('Škoda')")
            count = await elements.count()
            print(f"✅ Nalezeno {count} elementů obsahujících 'Škoda'")
            
            for i in range(min(count, 20)):  # Prvních 20
                element = elements.nth(i)
                tag_name = await element.evaluate('el => el.tagName')
                classes = await element.evaluate('el => el.className')
                text = await element.text_content()
                
                print(f"\n[{i+1}] {tag_name} | classes: '{classes}'")
                print(f"    Text: {text[:200]}...")
                
                # Zkontroluj, jestli obsahuje "Video:" nebo "Zdroj:"
                if text and ("Video:" in text or "Zdroj:" in text or "Auto" in text):
                    print(f"    🎯 MOŽNÝ ZDROJ!")
        
        except Exception as e:
            print(f"❌ Chyba při hledání 'Škoda': {e}")
        
        # 2. Zkus také hledat "Auto"
        try:
            print(f"\n🔍 Hledám text obsahující 'Auto'...")
            elements = page.locator("*:has-text('Auto')")
            count = await elements.count()
            print(f"✅ Nalezeno {count} elementů obsahujících 'Auto'")
            
            for i in range(min(count, 10)):  # Prvních 10
                element = elements.nth(i)
                text = await element.text_content()
                
                if text and len(text) < 200:  # Jen kratší texty
                    print(f"[{i+1}] {text}")
                    if "Video:" in text or "Zdroj:" in text:
                        print(f"    🎯 MOŽNÝ ZDROJ!")
        
        except Exception as e:
            print(f"❌ Chyba při hledání 'Auto': {e}")
        
        # 3. Zkus najít všechny elementy s textem obsahujícím ":"
        try:
            print(f"\n🔍 Hledám text obsahující ':'...")
            elements = page.locator("*:has-text(':')")
            count = await elements.count()
            print(f"✅ Nalezeno {count} elementů obsahujících ':'")
            
            for i in range(min(count, 30)):
                element = elements.nth(i)
                text = await element.text_content()
                
                if text and len(text) < 100 and ("Video:" in text or "Foto:" in text or "Zdroj:" in text):
                    print(f"[{i+1}] {text}")
        
        except Exception as e:
            print(f"❌ Chyba při hledání ':': {e}")
        
        print("\n" + "="*60)
        print("ℹ️ Ponechávám browser otevřený pro manuální kontrolu...")
        print("Najděte na stránce text 'Video: Škoda Auto' a podívejte se na jeho HTML strukturu")
        print("Stiskněte Enter pro ukončení...")
        input()
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(find_skoda_text())
