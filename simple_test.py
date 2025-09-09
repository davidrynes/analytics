#!/usr/bin/env python3
"""
Jednoduchý test pro nalezení správného selektoru na Novinky.cz
"""

import asyncio
from playwright.async_api import async_playwright

async def simple_test():
    url = "https://www.novinky.cz/clanek/auto-skoda-poodhaluje-elektrickou-octavii-ostre-rezany-koncept-zaujme-i-netradicnimi-dvermi-40537197"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        print(f"🔍 Načítám stránku...")
        await page.goto(url)
        await page.wait_for_load_state('domcontentloaded')
        await asyncio.sleep(2)
        
        # Zkus odkliknout popup
        print("🔘 Hledám popup...")
        try:
            # Zkus různé způsoby odkliknutí popup
            popup_found = False
            
            # 1. Hledej tlačítko "Přijmout vše" nebo podobné
            accept_buttons = [
                "button:has-text('Přijmout')",
                "button:has-text('Souhlasím')",
                "button:has-text('OK')",
                "button:has-text('Přijmout vše')",
                "[id*='accept']",
                "[class*='accept']"
            ]
            
            for btn_selector in accept_buttons:
                try:
                    btn = page.locator(btn_selector)
                    if await btn.count() > 0:
                        await btn.first.click()
                        print(f"✅ Popup odkliknuto: {btn_selector}")
                        popup_found = True
                        await asyncio.sleep(2)
                        break
                except:
                    continue
            
            if not popup_found:
                print("⚠️ Popup nenalezen nebo už byl zavřen")
                
        except Exception as e:
            print(f"❌ Chyba při popup: {e}")
        
        await asyncio.sleep(3)
        
        # Zkus najít náš cílový text
        print("\n🎯 Hledám 'Video: Škoda Auto'...")
        
        # Test jednotlivých selektorů
        test_selectors = [
            ".f_bK",
            "span.f_bK", 
            "figcaption span.f_bK",
            "figcaption .f_bK",
            "*:has-text('Škoda Auto')",
            "*:has-text('Video: Škoda Auto')"
        ]
        
        for selector in test_selectors:
            try:
                elements = page.locator(selector)
                count = await elements.count()
                print(f"   {selector}: {count} elementů")
                
                if count > 0:
                    for i in range(min(count, 3)):
                        text = await elements.nth(i).text_content()
                        print(f"      [{i}]: '{text}'")
                        
                        if "Škoda Auto" in text:
                            print(f"🎉 NALEZEN ZDROJ: '{text}'")
                            
            except Exception as e:
                print(f"   {selector}: CHYBA - {e}")
        
        print(f"\n⏳ Ponechávám browser otevřený...")
        print(f"Zkontrolujte stránku manuálně a najděte 'Video: Škoda Auto'")
        print(f"Stiskněte Enter pro ukončení...")
        input()
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(simple_test())
