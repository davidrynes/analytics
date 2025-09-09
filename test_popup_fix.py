#!/usr/bin/env python3
"""
Test s lepším handling popup okna
"""

import asyncio
from playwright.async_api import async_playwright

async def test_with_popup_fix():
    url = "https://www.novinky.cz/clanek/auto-skoda-poodhaluje-elektrickou-octavii-ostre-rezany-koncept-zaujme-i-netradicnimi-dvermi-40537197"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        print(f"🔍 Načítám stránku...")
        await page.goto(url)
        await page.wait_for_load_state('domcontentloaded')
        await asyncio.sleep(3)
        
        print(f"📋 Název stránky: {await page.title()}")
        
        # Robustnější handling popup okna
        print("🔘 Hledám a odklikávám popup okno...")
        popup_handled = False
        
        # Zkus různé strategie pro popup
        popup_strategies = [
            # Strategie 1: Hledej tlačítka s textem
            {
                "name": "Tlačítka s textem",
                "selectors": [
                    "button:has-text('Souhlasím')",
                    "button:has-text('Přijmout')", 
                    "button:has-text('Přijmout vše')",
                    "button:has-text('Akceptuji')",
                    "button:has-text('OK')",
                    "button:has-text('Ano')"
                ]
            },
            # Strategie 2: Hledej podle atributů
            {
                "name": "Podle atributů",
                "selectors": [
                    "[data-testid*='accept']",
                    "[data-testid*='consent']",
                    "[id*='accept']",
                    "[id*='consent']",
                    "[class*='accept']",
                    "[class*='consent']"
                ]
            },
            # Strategie 3: Obecné tlačítka v popup/modal
            {
                "name": "Obecné popup tlačítka",
                "selectors": [
                    ".modal button",
                    ".popup button",
                    ".overlay button",
                    ".consent button",
                    ".cookie button",
                    "div[role='dialog'] button"
                ]
            }
        ]
        
        for strategy in popup_strategies:
            if popup_handled:
                break
                
            print(f"   Zkouším strategii: {strategy['name']}")
            for selector in strategy['selectors']:
                try:
                    elements = page.locator(selector)
                    count = await elements.count()
                    
                    if count > 0:
                        print(f"      Nalezeno {count} elementů pro '{selector}'")
                        for i in range(count):
                            try:
                                element = elements.nth(i)
                                text = await element.text_content()
                                is_visible = await element.is_visible()
                                
                                print(f"         [{i}] Text: '{text}' | Viditelné: {is_visible}")
                                
                                if is_visible and ('souhlasím' in text.lower() or 'přijmout' in text.lower() or 'accept' in text.lower()):
                                    await element.click()
                                    print(f"✅ Popup odkliknuto: '{text}' pomocí '{selector}'")
                                    popup_handled = True
                                    await asyncio.sleep(2)
                                    break
                            except Exception as e:
                                print(f"         [{i}] Chyba při kliknutí: {e}")
                                continue
                    
                    if popup_handled:
                        break
                        
                except Exception as e:
                    print(f"      Chyba při selektoru '{selector}': {e}")
                    continue
        
        if not popup_handled:
            print("⚠️ Popup nebyl automaticky odkliknout - zkuste manuálně")
            print("   Klikněte na 'Souhlasím' nebo 'Přijmout' a stiskněte Enter")
            input("   Stiskněte Enter po odkliknutí popup...")
        
        await asyncio.sleep(2)
        
        # Teď zkus najít zdroj
        print("\n🎯 Hledám 'Video: Škoda Auto'...")
        
        test_selectors = [
            ".f_bK",
            "span.f_bK", 
            "figcaption span.f_bK",
            "figcaption .f_bK",
            "*:has-text('Škoda Auto')",
            "*:has-text('Video: Škoda Auto')",
            "*:has-text('Video:')"
        ]
        
        found_source = None
        
        for selector in test_selectors:
            try:
                elements = page.locator(selector)
                count = await elements.count()
                print(f"   {selector}: {count} elementů")
                
                if count > 0:
                    for i in range(min(count, 3)):
                        try:
                            text = await elements.nth(i).text_content()
                            print(f"      [{i}]: '{text}'")
                            
                            if "Škoda Auto" in text:
                                found_source = text
                                print(f"🎉 NALEZEN ZDROJ: '{text}'")
                                
                        except Exception as e:
                            print(f"      [{i}]: Chyba - {e}")
                            
            except Exception as e:
                print(f"   {selector}: CHYBA - {e}")
        
        print("\n" + "="*60)
        if found_source:
            print(f"✅ ÚSPĚCH! Nalezen zdroj: '{found_source}'")
        else:
            print("❌ Zdroj nenalezen")
        print("="*60)
        
        print(f"\n⏳ Ponechávám browser otevřený pro manuální kontrolu...")
        print(f"Zkontrolujte stránku a najděte 'Video: Škoda Auto'")
        print(f"Stiskněte Enter pro ukončení...")
        input()
        
        await browser.close()
        return found_source

if __name__ == "__main__":
    result = asyncio.run(test_with_popup_fix())
    print(f"\nVýsledek: {result}")
