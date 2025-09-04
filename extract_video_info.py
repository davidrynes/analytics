#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Playwright skript pro automatické vyhledávání videí na Google a extrakci informací z Novinky.cz.
- Načte vyčištěná data z CSV
- Pro každé video vyhledá na Google
- Najde odkaz na Novinky.cz
- Extrahuje informace z div s třídou "ogm-main-media__container"
- Uloží výsledky do nového CSV souboru
"""

import asyncio
import pandas as pd
import time
import random
from playwright.async_api import async_playwright
import csv
import sys
import os
import urllib.parse

class VideoInfoExtractor:
    def __init__(self, csv_file, output_file):
        self.csv_file = csv_file
        self.output_file = output_file
        self.data = None
        self.results = []
        
        # Seznam různých User-Agent pro rotaci
        self.user_agents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
        ]
        
        # Index pro rotaci User-Agent
        self.current_user_agent_index = 0
        
    def get_next_user_agent(self):
        """Vrátí další User-Agent z rotace."""
        user_agent = self.user_agents[self.current_user_agent_index]
        self.current_user_agent_index = (self.current_user_agent_index + 1) % len(self.user_agents)
        return user_agent
    
    async def load_data(self):
        """Načte data z CSV souboru."""
        try:
            # Načtení dat s explicitními parametry pro správné parsování
            df = pd.read_csv(self.csv_file, encoding='utf-8', sep=',', quotechar='"', on_bad_lines='skip')
            print(f"Načteno {len(df)} videí z {self.csv_file}")
            
            # Filtrování videí s Views >= 1000
            df_filtered = df[df['Views'] >= 1000].copy()
            print(f"Po filtrování (Views >= 1000): {len(df_filtered)} videí")
            
            if len(df_filtered) == 0:
                print("❌ Žádná videa nesplňují kritérium Views >= 1000")
                return False
            
            self.data = df_filtered
            return True
            
        except Exception as e:
            print(f"Chyba při načítání dat: {e}")
            return False
    
    async def search_on_seznam(self, page, query):
        """Vyhledá na Seznam.cz pomocí generované URL."""
        try:
            # Generování URL pro vyhledávání na Seznam.cz
            # Použijeme site:novinky.cz pro omezení výsledků pouze na Novinky.cz
            search_query = f"{query} site:novinky.cz"
            encoded_query = urllib.parse.quote(search_query)
            search_url = f"https://search.seznam.cz/?q={encoded_query}"
            
            print(f"Generuji URL pro vyhledávání: {search_url}")
            print(f"Vyhledávám: {query}")
            
            # Přejdeme přímo na vyhledávací URL
            await page.goto(search_url, wait_until="domcontentloaded")
            await page.wait_for_timeout(random.uniform(1000, 2000))  # Zkráceno z 2000-4000
            print("Seznam vyhledávání dokončeno")
            
            return True
            
        except Exception as e:
            print(f"Chyba při vyhledávání na Seznam.cz: {e}")
            return False
    
    async def find_novinky_link_on_seznam(self, page, video_title):
        """Najde odkaz na Novinky.cz ve výsledcích Seznam.cz vyhledávání."""
        try:
            print("Hledám odkazy na Novinky.cz ve výsledcích Seznam.cz...")
            
            # Hledání odkazů na Novinky.cz
            novinky_links = page.locator("a[href*='novinky.cz']")
            
            if await novinky_links.count() > 0:
                print(f"Nalezeno {await novinky_links.count()} odkazů na Novinky.cz")
                
                # Procházíme všechny odkazy a hledáme nejlepší shodu
                best_link = None
                best_score = 0
                
                for i in range(min(await novinky_links.count(), 20)):  # Omezíme na prvních 20
                    link = novinky_links.nth(i)
                    link_text = await link.text_content()
                    href = await link.get_attribute("href")
                    
                    if link_text and href:
                        # Filtrujeme odkazy na diskuze a nevalidní URL
                        if ("diskuze" in href.lower() or "forum" in href.lower() or 
                            href.startswith('?') or href.startswith('/') or 
                            'zbozi.cz' in href or 'firmy.cz' in href or 
                            'mapy.com' in href or 'slovnik.seznam.cz' in href):
                            print(f"  Přeskočen nevalidní odkaz: {href[:80]}...")
                            continue
                        
                        # Kontrola, zda je to skutečně odkaz na Novinky.cz článek
                        if 'novinky.cz' in href and ('/clanek/' in href or '/video/' in href or '/zpravy/' in href):
                            print(f"  Odkaz {i+1}: {link_text[:50]}... -> {href}")
                            
                            # Jednoduchý algoritmus pro nalezení nejlepší shody
                            score = self.calculate_similarity(video_title.lower(), link_text.lower())
                            if score > best_score:
                                best_score = score
                                best_link = href
                        else:
                            print(f"  Přeskočen nečlánkový odkaz: {href[:80]}...")
                
                if best_link:
                    print(f"✅ Nejlepší shoda (skóre: {best_score:.2f}): {best_link}")
                    return best_link
                else:
                    print("Nenalezena dostatečná shoda")
                    return None
            else:
                print("Nenalezen odkaz na Novinky.cz")
                return None
                
        except Exception as e:
            print(f"Chyba při hledání odkazu na Novinky.cz: {e}")
            return None
    
    def calculate_similarity(self, text1, text2):
        """Vypočítá jednoduchou podobnost mezi dvěma texty."""
        words1 = set(text1.split())
        words2 = set(text2.split())
        
        if not words1 or not words2:
            return 0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union) if union else 0
    
    async def extract_video_info(self, page, novinky_url):
        """Extrahuje informace z Novinky.cz stránky."""
        try:
            print(f"Přejdeme na Novinky.cz stránku: {novinky_url}")
            # Přejdeme na Novinky.cz stránku
            await page.goto(novinky_url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)
            
            print("Stránka načtena, hledám informace...")
            
            # Přijetí cookies na Novinky.cz (pokud se objeví)
            try:
                cookie_button = page.locator("button[data-testid='cw-button-agree-with-ads'], button:has-text('Souhlasím')")
                if await cookie_button.count() > 0:
                    await cookie_button.click()
                    await page.wait_for_timeout(2000)
                    print("Cookies na Novinky.cz přijaty")
            except Exception as e:
                print(f"Chyba při přijímání cookies na Novinky.cz: {e}")
            
            # Hledání video informací - zkusíme různé přístupy
            video_info = None
            
            # 1. Zkusíme najít div s třídou "ogm-main-media__container"
            media_container = page.locator("div.ogm-main-media__container")
            if await media_container.count() > 0:
                print("✅ Nalezen div ogm-main-media__container")
                
                # Hledání span s třídou "f_bJ"
                span_element = media_container.locator("span.f_bJ")
                if await span_element.count() > 0:
                    span_text = await span_element.text_content()
                    print(f"✅ Nalezen span f_bJ: {span_text[:100]}...")
                    video_info = span_text.strip()
                else:
                    print("Nenalezen span s třídou 'f_bJ', hledám alternativy...")
                    
                    # Hledání jiných elementů v media containeru
                    video_info = await self.find_video_info_in_container(media_container)
            
            # 2. Pokud nenalezeno, zkusíme hledat po celé stránce
            if not video_info:
                print("Hledám video informace po celé stránce...")
                video_info = await self.find_video_info_on_page(page)
            
            # 3. Zkusíme najít elementy s textem "Video:"
            if not video_info:
                print("Hledám elementy obsahující 'Video:'...")
                video_elements = page.locator("*:has-text('Video:')")
                if await video_elements.count() > 0:
                    for i in range(min(await video_elements.count(), 5)):
                        element = video_elements.nth(i)
                        element_text = await element.text_content()
                        if element_text and "Video:" in element_text:
                            # Extrahujeme pouze část s "Video:"
                            video_start = element_text.find("Video:")
                            if video_start != -1:
                                video_info = element_text[video_start:].strip()
                                print(f"✅ Nalezen element s 'Video:': {video_info[:100]}...")
                                break
            
            if video_info:
                # Odstranění "Video:" z výsledku
                if video_info.startswith("Video:"):
                    video_info = video_info[6:].strip()  # Odstraní "Video:" a mezery
                return video_info
            else:
                print("Nenalezeny žádné informace o videu")
                return None
                
        except Exception as e:
            print(f"Chyba při extrakci informací z Novinky.cz: {e}")
            return None
    
    async def find_video_info_in_container(self, container):
        """Hledá video informace v daném kontejneru."""
        try:
            video_info_selectors = [
                "span:has-text('Video:')",  # Hledáme span obsahující "Video:"
                "div:has-text('Video:')",   # Hledáme div obsahující "Video:"
                "p:has-text('Video:')",    # Hledáme p obsahující "Video:"
                "[class*='video']",         # Elementy s třídou obsahující "video"
                "[class*='media']",         # Elementy s třídou obsahující "media"
                "span",                     # Všechny spany v kontejneru
                "div",                      # Všechny divy v kontejneru
                "p"                         # Všechny paragrafy v kontejneru
            ]
            
            for selector in video_info_selectors:
                print(f"  Zkouším selector v kontejneru: {selector}")
                elements = container.locator(selector)
                if await elements.count() > 0:
                    for i in range(min(await elements.count(), 5)):
                        element = elements.nth(i)
                        element_text = await element.text_content()
                        if element_text and ("Video:" in element_text or "video" in element_text.lower()):
                            print(f"  ✅ Nalezen element s informacemi o videu: {element_text[:100]}...")
                            return element_text.strip()
            
            return None
        except Exception as e:
            print(f"Chyba při hledání v kontejneru: {e}")
            return None
    
    async def find_video_info_on_page(self, page):
        """Hledá video informace po celé stránce."""
        try:
            # Zkusíme najít alternativní elementy
            alternative_selectors = [
                "div[class*='video']",
                "div[class*='media']",
                "span[class*='video']",
                "span[class*='media']",
                "p[class*='video']",
                "p[class*='media']",
                "div[class*='source']",      # Elementy s třídou obsahující "source"
                "span[class*='source']",     # Elementy s třídou obsahující "source"
                "div[class*='credit']",      # Elementy s třídou obsahující "credit"
                "span[class*='credit']"      # Elementy s třídou obsahující "credit"
            ]
            
            for selector in alternative_selectors:
                print(f"  Zkouším alternativní selector: {selector}")
                elements = page.locator(selector)
                if await elements.count() > 0:
                    for i in range(min(await elements.count(), 3)):
                        element = elements.nth(i)
                        element_text = await element.text_content()
                        if element_text and ("Video:" in element_text or "video" in element_text.lower()):
                            print(f"  ✅ Nalezen alternativní element: {element_text[:100]}...")
                            return element_text.strip()
            
            return None
        except Exception as e:
            print(f"Chyba při hledání na stránce: {e}")
            return None
    
    async def process_video(self, page, index, row):
        """Zpracuje jedno video."""
        try:
            video_title = row['Název článku/videa']
            print(f"[{index+1}/{len(self.data)}] Zpracovávám: {video_title[:50]}...")
            
            # Vyhledání na Seznam.cz
            if not await self.search_on_seznam(page, video_title):
                # Screenshot pro debugging
                # await page.screenshot(path=f"debug_search_{index+1}.png")
                # print(f"Screenshot uložen jako debug_search_{index+1}.png")
                return None
            
            # Screenshot výsledků vyhledávání
            # await page.screenshot(path=f"debug_results_{index+1}.png")
            # print(f"Screenshot výsledků uložen jako debug_results_{index+1}.png")
            
            # Hledání odkazu na Novinky.cz na Seznam.cz
            novinky_url = await self.find_novinky_link_on_seznam(page, video_title)
            if not novinky_url:
                return None
            
            # Extrakce informací
            extracted_info = await self.extract_video_info(page, novinky_url)
            
            # Uložení výsledku
            result = {
                'Jméno rubriky': row['Jméno rubriky'],
                'Název článku/videa': row['Název článku/videa'],
                'Views': row['Views'],
                'Extrahované info': extracted_info,
                'Novinky URL': novinky_url
            }
            
            self.results.append(result)
            print(f"✅ Úspěšně zpracováno: {extracted_info[:50] if extracted_info else 'N/A'}...")
            
            # Čekání mezi videi (anti-bot ochrana)
            wait_time = random.uniform(3, 8)  # Zkráceno z 5-15 sekund
            print(f"Čekám {wait_time:.1f} sekund...")
            await asyncio.sleep(wait_time)
            
        except Exception as e:
            print(f"❌ Chyba při zpracování videa '{row.iloc[1]}': {e}")
            return None
    
    async def run(self, max_videos=None):
        """Spustí hlavní proces extrakce."""
        if not await self.load_data():
            return False
        
        # Data jsou již filtrována podle Views >= 1000
        print(f"Zpracovávám všechna videa s Views >= 1000")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=False)  # headless=False pro sledování
            page = await browser.new_page()
            
            try:
                for index, row in self.data.iterrows():
                    await self.process_video(page, index, row)
                    
                    # Průběžné ukládání po každém videu
                    await self.save_results()
                    print(f"Průběžně uloženo {len(self.results)} výsledků")
                
                print(f"Celkem zpracováno {len(self.results)} videí")
                
            finally:
                await browser.close()
        
        return True
    
    async def save_results(self):
        """Uloží výsledky do CSV souboru."""
        try:
            df_results = pd.DataFrame(self.results)
            df_results.to_csv(self.output_file, index=False, encoding='utf-8')
            print(f"Výsledky uloženy do {self.output_file}")
        except Exception as e:
            print(f"Chyba při ukládání výsledků: {e}")

async def main():
    """Hlavní funkce."""
    csv_file = "videa_vycistena.csv"
    output_file = "videa_s_extrahovanymi_info.csv"
    
    # Kontrola existence vstupního souboru
    if not os.path.exists(csv_file):
        print(f"Chyba: Vstupní soubor {csv_file} neexistuje.")
        return
    
    print("=" * 60)
    print("SKRIPT PRO EXTRAKCI INFORMACÍ Z NOVINKY.CZ")
    print("=" * 60)
    
    # Vytvoření extraktoru
    extractor = VideoInfoExtractor(csv_file, output_file)
    
    # Spuštění extrakce (omezeno na 5 videí pro testování)
    success = await extractor.run(max_videos=5)
    
    if success:
        print("\n" + "=" * 60)
        print("EXTRAKCE DOKONČENA ÚSPĚŠNĚ")
        print("=" * 60)
    else:
        print("\n" + "=" * 60)
        print("EXTRAKCE SELHALA")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
