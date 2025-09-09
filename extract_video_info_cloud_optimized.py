#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CLOUD-OPTIMIZED Playwright skript optimalizovaný pro Railway a jiné cloud prostředí.
- Lepší anti-bot ochrana pro datacenterové IP adresy
- Pomalejší zpracování s více pauzami
- Rotace User-Agents a proxy-like behavior
- Fallback na Google search když Seznam.cz blokuje
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
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor

class CloudOptimizedVideoInfoExtractor:
    def __init__(self, csv_file, output_file, max_concurrent=1, retry_failed=True, batch_size=20):
        self.csv_file = csv_file
        self.output_file = output_file
        self.data = None
        self.results = []
        self.max_concurrent = max_concurrent  # Pouze 1 concurrent worker pro cloud
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.progress_file = "progress.json"
        self.retry_failed = retry_failed
        self.failed_videos = []
        self.batch_size = batch_size  # Menší batche pro cloud
        
        # Rozšířený seznam User-Agents pro cloud prostředí
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        ]
        
        # Index pro rotaci User-Agent
        self.current_user_agent_index = 0
        
        # Počítadlo pro sledování anti-bot opatření
        self.seznam_failures = 0
        self.max_seznam_failures = 5  # Po 5 selháních přejdeme na Google
        
    def update_progress(self, current, total, status="processing", message=None):
        """Aktualizuje progress soubor."""
        try:
            progress_data = {
                "current": current,
                "total": total,
                "status": status,
                "message": message or f"Zpracováno {current} z {total} videí",
                "percentage": round((current / total * 100), 1) if total > 0 else 0
            }
            with open(self.progress_file, 'w', encoding='utf-8') as f:
                json.dump(progress_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Chyba při aktualizaci progress: {e}")
        
    def get_next_user_agent(self):
        """Vrátí další User-Agent z rotace."""
        user_agent = self.user_agents[self.current_user_agent_index]
        self.current_user_agent_index = (self.current_user_agent_index + 1) % len(self.user_agents)
        return user_agent
    
    async def load_data(self):
        """Načte data z CSV souboru."""
        try:
            df = pd.read_csv(self.csv_file, encoding='utf-8', sep=';', quotechar='"', on_bad_lines='skip')
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

    async def setup_cloud_browser_context(self, browser):
        """Nastaví browser context optimalizovaný pro cloud prostředí."""
        # Simulace reálného prohlížeče
        context = await browser.new_context(
            user_agent=self.get_next_user_agent(),
            viewport={'width': 1920, 'height': 1080},
            locale='cs-CZ',
            timezone_id='Europe/Prague',
            geolocation={'latitude': 50.0755, 'longitude': 14.4378},  # Praha
            permissions=['geolocation'],
            extra_http_headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
        )
        
        # Přidání cookies pro simulaci návštěvy
        await context.add_cookies([
            {
                'name': 'visited_before',
                'value': 'true',
                'domain': '.seznam.cz',
                'path': '/'
            }
        ])
        
        page = await context.new_page()
        
        # Simulace lidského chování - nastavení WebGL, canvas fingerprint atd.
        await page.add_init_script("""
            // Skrytí automatizace
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // Simulace reálných rozměrů obrazovky
            Object.defineProperty(screen, 'width', {
                get: () => 1920,
            });
            Object.defineProperty(screen, 'height', {
                get: () => 1080,
            });
            
            // Přidání náhodnosti do canvas fingerprinting
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type) {
                if (type === '2d') {
                    const context = getContext.call(this, type);
                    const getImageData = context.getImageData;
                    context.getImageData = function() {
                        const imageData = getImageData.apply(this, arguments);
                        // Přidání malé náhodnosti
                        for (let i = 0; i < imageData.data.length; i += 4) {
                            if (Math.random() < 0.001) {
                                imageData.data[i] = Math.floor(Math.random() * 256);
                            }
                        }
                        return imageData;
                    };
                    return context;
                }
                return getContext.call(this, type);
            };
        """)
        
        return page

    async def search_on_seznam_cloud(self, page, query, max_retries=2):
        """Cloud-optimalizované vyhledávání na Seznam.cz."""
        if self.seznam_failures >= self.max_seznam_failures:
            print(f"⚠️ Seznam.cz má příliš mnoho selhání ({self.seznam_failures}), přeskakuji")
            return False
            
        for attempt in range(max_retries):
            try:
                # Delší čekání pro cloud prostředí
                await asyncio.sleep(random.uniform(2, 4))
                
                search_query = f"{query} site:novinky.cz"
                encoded_query = urllib.parse.quote(search_query)
                search_url = f"https://search.seznam.cz/?q={encoded_query}"
                
                print(f"🔍 Seznam.cz pokus {attempt + 1}: {search_url[:100]}...")
                
                # Simulace lidského chování - nejdříve na homepage
                if attempt == 0:
                    await page.goto("https://www.seznam.cz", wait_until="domcontentloaded", timeout=10000)
                    await asyncio.sleep(random.uniform(1, 3))
                
                await page.goto(search_url, wait_until="domcontentloaded", timeout=12000)
                await asyncio.sleep(random.uniform(1, 2))
                
                # Kontrola, jestli nás Seznam.cz neblokuje
                page_content = await page.content()
                if "captcha" in page_content.lower() or "robot" in page_content.lower():
                    print(f"⚠️ Seznam.cz detekoval robota, zvyšujem selhání")
                    self.seznam_failures += 1
                    return False
                
                return True
                
            except Exception as e:
                print(f"Seznam.cz pokus {attempt + 1}/{max_retries} selhal: {e}")
                self.seznam_failures += 1
                if attempt < max_retries - 1:
                    await asyncio.sleep(random.uniform(3, 6))
                    continue
                return False

    async def search_on_google_cloud(self, page, query, max_retries=3):
        """Cloud-optimalizované vyhledávání na Google."""
        for attempt in range(max_retries):
            try:
                # Delší čekání pro cloud prostředí
                await asyncio.sleep(random.uniform(2, 5))
                
                search_query = f"{query} site:novinky.cz"
                encoded_query = urllib.parse.quote(search_query)
                search_url = f"https://www.google.com/search?q={encoded_query}&hl=cs&gl=cz"
                
                print(f"🌐 Google pokus {attempt + 1}: {search_url[:100]}...")
                
                # Simulace lidského chování
                if attempt == 0:
                    await page.goto("https://www.google.com", wait_until="domcontentloaded", timeout=10000)
                    await asyncio.sleep(random.uniform(1, 2))
                
                await page.goto(search_url, wait_until="domcontentloaded", timeout=12000)
                await asyncio.sleep(random.uniform(1, 3))
                
                # Kontrola na CAPTCHA
                page_content = await page.content()
                if "captcha" in page_content.lower() or "unusual traffic" in page_content.lower():
                    print(f"⚠️ Google detekoval neobvyklý provoz")
                    await asyncio.sleep(random.uniform(10, 20))  # Delší čekání
                    continue
                
                return True
                
            except Exception as e:
                print(f"Google pokus {attempt + 1}/{max_retries} selhal: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(random.uniform(5, 10))
                    continue
                return False

    async def find_novinky_link_on_seznam(self, page, video_title):
        """Hledání odkazu na Novinky.cz na Seznam.cz s cloud optimalizací."""
        try:
            await asyncio.sleep(random.uniform(1, 2))  # Simulace čtení výsledků
            
            novinky_links = page.locator("a[href*='novinky.cz']")
            
            if await novinky_links.count() > 0:
                best_link = None
                best_score = 0
                
                for i in range(min(await novinky_links.count(), 8)):  # Méně odkazů pro rychlost
                    link = novinky_links.nth(i)
                    href = await link.get_attribute("href")
                    
                    if href and 'novinky.cz' in href and ('/clanek/' in href or '/video/' in href):
                        link_text = await link.text_content()
                        if link_text:
                            score = self.calculate_similarity(video_title.lower(), link_text.lower())
                            if score > best_score:
                                best_score = score
                                best_link = href
                
                if best_link and best_score > 0.15:  # Mírně vyšší práh
                    return best_link
                    
            return None
                
        except Exception as e:
            print(f"Chyba při hledání odkazu na Seznam.cz: {e}")
            return None

    async def find_novinky_link_on_google(self, page, video_title):
        """Hledání odkazu na Novinky.cz na Google s cloud optimalizací."""
        try:
            await asyncio.sleep(random.uniform(1, 3))  # Simulace čtení výsledků
            
            # Google má různé selektory
            selectors_to_try = [
                "a[href*='novinky.cz']",
                "h3 ~ a[href*='novinky.cz']",
                "[data-ved] a[href*='novinky.cz']"
            ]
            
            for selector in selectors_to_try:
                result_links = page.locator(selector)
                
                if await result_links.count() > 0:
                    best_link = None
                    best_score = 0
                    
                    for i in range(min(await result_links.count(), 5)):
                        link = result_links.nth(i)
                        href = await link.get_attribute("href")
                        
                        if href and 'novinky.cz' in href:
                            # Google někdy wrappuje URLs
                            if href.startswith('/url?q='):
                                href = urllib.parse.unquote(href.split('/url?q=')[1].split('&')[0])
                            
                            if '/clanek/' in href or '/video/' in href:
                                link_text = await link.text_content()
                                if link_text:
                                    score = self.calculate_similarity(video_title.lower(), link_text.lower())
                                    if score > best_score:
                                        best_score = score
                                        best_link = href
                    
                    if best_link and best_score > 0.15:
                        return best_link
                        
            return None
                
        except Exception as e:
            print(f"Chyba při hledání odkazu na Google: {e}")
            return None
    
    def calculate_similarity(self, text1, text2):
        """Výpočet podobnosti s vylepšeným algoritmem."""
        words1 = set(text1.split()[:12])  # Více slov pro lepší přesnost
        words2 = set(text2.split()[:12])
        
        if not words1 or not words2:
            return 0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        jaccard = len(intersection) / len(union) if union else 0
        
        # Bonus pro přesné shody klíčových slov
        key_words = ['policie', 'soud', 'vláda', 'prezident', 'nehoda', 'požár']
        bonus = 0
        for word in key_words:
            if word in text1 and word in text2:
                bonus += 0.1
        
        return min(jaccard + bonus, 1.0)

    async def extract_video_info(self, page, novinky_url, max_retries=2):
        """Cloud-optimalizovaná extrakce informací z Novinky.cz."""
        for attempt in range(max_retries):
            try:
                await asyncio.sleep(random.uniform(1, 3))  # Anti-bot čekání
                
                print(f"🌐 Načítám stránku: {novinky_url}")
                await page.goto(novinky_url, wait_until="domcontentloaded", timeout=15000)
                await asyncio.sleep(random.uniform(2, 4))  # Delší čekání pro cloud
                print(f"✅ Stránka načtena úspěšně")
                
                # Rychlé přijetí cookies
                if attempt == 0:
                    try:
                        cookie_selectors = [
                            "button[data-testid='cw-button-agree-with-ads']",
                            "button:has-text('Souhlasím')",
                            "button:has-text('Přijmout')",
                            "button:has-text('OK')",
                            ".cookie-consent button"
                        ]
                        
                        for selector in cookie_selectors:
                            cookie_button = page.locator(selector)
                            if await cookie_button.count() > 0:
                                await cookie_button.click()
                                await asyncio.sleep(1)
                                break
                    except:
                        pass
                
                # Simulace scrollování (lidské chování)
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)")
                await asyncio.sleep(0.5)
                
                # Rozšířené hledání zdrojů
                selectors_to_try = [
                    "span.f_bJ",
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
                    "[data-testid*='source']",
                    ".article-meta span",
                    ".video-meta span",
                ]
                
                for selector in selectors_to_try:
                    try:
                        elements = page.locator(selector)
                        count = await elements.count()
                        
                        if count > 0:
                            for i in range(min(count, 3)):
                                element = elements.nth(i)
                                text = await element.text_content()
                                
                                if text and len(text.strip()) > 0:
                                    clean_text = text.strip()
                                    
                                    if 3 <= len(clean_text) <= 200:
                                        # Odstranění prefixů
                                        for prefix in ['Video:', 'Foto:', 'Zdroj:', 'Autor:', 'Redakce:']:
                                            if clean_text.startswith(prefix):
                                                clean_text = clean_text[len(prefix):].strip()
                                        
                                        if clean_text and len(clean_text) > 2:
                                            print(f"🎯 Nalezen zdroj pomocí '{selector}': {clean_text[:50]}...")
                                            return clean_text
                                            
                    except Exception as e:
                        continue
                
                # Hledání podle klíčových slov
                common_sources = ['ČT24', 'ČTK', 'Reuters', 'AP', 'DPA', 'AFP', 'iStock', 'Shutterstock', 'Getty', 'Profimedia', 'Facebook', 'Twitter', 'Instagram', 'TikTok']
                for source in common_sources:
                    try:
                        elements = page.locator(f"*:has-text('{source}')")
                        if await elements.count() > 0:
                            element = elements.first
                            text = await element.text_content()
                            if text and source in text:
                                lines = text.split('\n')
                                for line in lines:
                                    if source in line and len(line.strip()) < 100:
                                        print(f"🎯 Nalezen zdroj podle klíčového slova '{source}': {line.strip()}")
                                        return line.strip()
                    except Exception as e:
                        pass
                    
            except Exception as e:
                print(f"Pokus {attempt + 1}/{max_retries} extrakce selhal: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(random.uniform(3, 6))
                    continue
                    
        print(f"Extrakce selhala po {max_retries} pokusech")
        return None

    async def process_video_worker(self, page, index, row):
        """Cloud-optimalizovaný worker pro zpracování jednoho videa."""
        async with self.semaphore:
            video_title = row['Název článku/videa']
            print(f"[{index+1}] Zpracovávám: {video_title[:50]}...")
            
            extracted_info = None
            novinky_url = ""
            extraction_status = "success"
            strategy_used = ""
            
            try:
                # STRATEGIE 1: Seznam.cz search (pokud není moc blokovaný)
                if self.seznam_failures < self.max_seznam_failures:
                    print(f"🔍 Strategie 1: Seznam.cz search (selhání: {self.seznam_failures})")
                    if await self.search_on_seznam_cloud(page, video_title):
                        novinky_url = await self.find_novinky_link_on_seznam(page, video_title)
                        if novinky_url:
                            extracted_info = await self.extract_video_info(page, novinky_url)
                            if extracted_info:
                                strategy_used = "seznam_search"
                                print(f"✅ [{index+1}] Úspěch přes Seznam.cz")
                
                # STRATEGIE 2: Google search (hlavní strategie pro cloud)
                if not extracted_info:
                    print(f"🌐 Strategie 2: Google search")
                    if await self.search_on_google_cloud(page, video_title):
                        novinky_url = await self.find_novinky_link_on_google(page, video_title)
                        if novinky_url:
                            extracted_info = await self.extract_video_info(page, novinky_url)
                            if extracted_info:
                                strategy_used = "google_search"
                                print(f"✅ [{index+1}] Úspěch přes Google")
                
                if extracted_info:
                    extraction_status = "success"
                    print(f"✅ [{index+1}] Zdroj úspěšně extrahován ({strategy_used})")
                else:
                    extraction_status = "all_strategies_failed"
                    print(f"⚠️ [{index+1}] Všechny strategie selhaly")
                            
            except Exception as e:
                print(f"❌ [{index+1}] Chyba při zpracování: {e}")
                extraction_status = "error"
            
            # Určení finálního zdroje
            if extraction_status == "success" and extracted_info:
                clean_extracted_info = extracted_info
            else:
                clean_extracted_info = "Zdroj nenalezen - cloud optimalizace"
                if self.retry_failed:
                    self.failed_videos.append((index, row))
            
            # Čištění extrahovaného info
            if len(clean_extracted_info) > 200:
                clean_extracted_info = clean_extracted_info[:100] + "..."
                
            import re
            clean_extracted_info = re.sub(r'<[^>]+>', '', clean_extracted_info)
            clean_extracted_info = clean_extracted_info.replace('\n', ' ').replace('\t', ' ').strip()
            
            # Vytvoření záznamu
            result = {
                'Jméno rubriky': str(row['Jméno rubriky']).strip(),
                'Název článku/videa': str(row['Název článku/videa']).strip(),
                'Views': int(row['Views']),
                'Dokoukanost do 25 %': float(row['Dokoukanost do 25 %']) if pd.notna(row['Dokoukanost do 25 %']) else 0.0,
                'Dokoukanost do 50 %': float(row['Dokoukanost do 50 %']) if pd.notna(row['Dokoukanost do 50 %']) else 0.0,
                'Dokoukanost do 75 %': float(row['Dokoukanost do 75 %']) if pd.notna(row['Dokoukanost do 75 %']) else 0.0,
                'Dokoukanost do 100 %': float(row['Dokoukanost do 100 %']) if pd.notna(row['Dokoukanost do 100 %']) else 0.0,
                'Extrahované info': clean_extracted_info,
                'Novinky URL': str(novinky_url).strip() if novinky_url else "",
                'Strategie': strategy_used if strategy_used else "failed"
            }
            
            self.results.append(result)
            
            # Aktualizace progress
            self.update_progress(len(self.results), len(self.data), "processing")
            
            # Průběžné ukládání každých 5 videí (častěji pro cloud)
            if len(self.results) % 5 == 0:
                await self.save_results()
                print(f"💾 Průběžné uložení - {len(self.results)} videí")
            
            # Delší anti-bot čekání pro cloud prostředí
            await asyncio.sleep(random.uniform(5, 10))
            
            return result

    async def process_batch(self, browser, batch_data, batch_number, total_batches):
        """Cloud-optimalizované zpracování jedné dávky."""
        print(f"📦 Zpracovávám dávku {batch_number}/{total_batches} ({len(batch_data)} videí)")
        
        # Pro cloud používáme pouze 1 page
        page = await self.setup_cloud_browser_context(browser)
        
        try:
            # Sekvenční zpracování pro cloud (bez concurrent workers)
            for idx, (index, row) in enumerate(batch_data.iterrows()):
                await self.process_video_worker(page, index, row)
                
                # Pauza mezi videi v rámci dávky
                if idx < len(batch_data) - 1:
                    await asyncio.sleep(random.uniform(3, 7))
            
            completed_count = len(batch_data)
            print(f"✅ Dávka {batch_number}/{total_batches} dokončena! Zpracováno {completed_count}/{len(batch_data)} videí")
            
            # Uložení po každé dávce
            await self.save_results()
            
            return completed_count
            
        finally:
            # Uzavření page
            try:
                await page.close()
            except:
                pass

    async def run_concurrent(self, max_videos=None):
        """Cloud-optimalizované batch zpracování."""
        if not await self.load_data():
            return False
        
        data_to_process = self.data
        if max_videos:
            data_to_process = self.data.head(max_videos)
        
        # Rozdělení na menší dávky pro cloud
        total_videos = len(data_to_process)
        total_batches = (total_videos + self.batch_size - 1) // self.batch_size
        
        print(f"🚀 Spouštím CLOUD-OPTIMALIZOVANÉ zpracování {total_videos} videí")
        print(f"📦 Rozděleno na {total_batches} dávek po {self.batch_size} videích")
        print(f"⚙️  Sekvenční zpracování (1 video za čas)")
        print(f"🔧 Strategie: 1) Google search (priorita), 2) Seznam.cz (fallback)")
        print(f"⏰ Delší pauzy mezi videi (5-10s) pro anti-bot ochranu")
        
        # Inicializace progress
        self.update_progress(0, total_videos, "starting", "Spouštím cloud-optimalizované zpracování...")
        
        async with async_playwright() as p:
            # Cloud prostředí - vždy headless s rozšířenými argumenty
            print("☁️ Spouštím v CLOUD režimu s anti-bot ochranou")
            browser = await p.chromium.launch(
                headless=True, 
                slow_mo=500,  # Pomalé pohyby pro simulaci lidského chování
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-extensions-except',
                    '--disable-extensions',
                    '--no-default-browser-check',
                    '--disable-default-apps',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-background-networking',
                    '--disable-sync',
                    '--metrics-recording-only',
                    '--disable-prompt-on-repost',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-client-side-phishing-detection',
                    '--disable-hang-monitor',
                    '--disable-popup-blocking',
                    '--disable-translate',
                    '--disable-ipc-flooding-protection',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ]
            )
            
            try:
                # Zpracování po dávkách s delšími pauzami
                for batch_num in range(total_batches):
                    start_idx = batch_num * self.batch_size
                    end_idx = min(start_idx + self.batch_size, total_videos)
                    
                    # Získání dávky dat
                    batch_data = data_to_process.iloc[start_idx:end_idx]
                    
                    print(f"\n📦 === CLOUD DÁVKA {batch_num + 1}/{total_batches} ===")
                    print(f"📊 Videí v dávce: {len(batch_data)} (indexy {start_idx}-{end_idx-1})")
                    print(f"📈 Celkový pokrok: {len(self.results)}/{total_videos} videí")
                    print(f"⚠️ Seznam.cz selhání: {self.seznam_failures}/{self.max_seznam_failures}")
                    
                    # Zpracování dávky
                    batch_processed = await self.process_batch(browser, batch_data, batch_num + 1, total_batches)
                    
                    # Aktualizace celkového progressu
                    self.update_progress(
                        len(self.results), 
                        total_videos, 
                        "processing", 
                        f"Dokončena dávka {batch_num + 1}/{total_batches}. Zpracováno {len(self.results)} videí."
                    )
                    
                    # Delší pauza mezi dávkami pro cloud prostředí
                    if batch_num < total_batches - 1:
                        pause_time = random.uniform(10, 20)
                        print(f"⏸️  Dlouhá pauza {pause_time:.1f}s mezi dávkami (anti-bot)...")
                        await asyncio.sleep(pause_time)
                
                print(f"\n✅ VŠECHNY CLOUD DÁVKY DOKONČENY!")
                print(f"📊 Celkem zpracováno: {len(self.results)}/{total_videos} videí")
                
                # Finální progress update
                self.update_progress(len(self.results), total_videos, "completed", f"Dokončeno! Zpracováno {len(self.results)} videí")
                
                # Finální uložení
                await self.save_results()
                
            finally:
                await browser.close()
        
        return True

    async def save_results(self):
        """Uloží výsledky do CSV."""
        try:
            if self.results:
                df_results = pd.DataFrame(self.results)
                df_results.to_csv(self.output_file, index=False, encoding='utf-8', sep=';')
                print(f"💾 Výsledky uloženy: {len(self.results)} záznamů -> {self.output_file}")
        except Exception as e:
            print(f"Chyba při ukládání: {e}")

async def main():
    """Hlavní funkce."""
    if len(sys.argv) >= 3:
        csv_file = sys.argv[1]
        output_file = sys.argv[2]
    else:
        csv_file = "/Users/david.rynes/Desktop/_DESKTOP/_CODE/statistiky/datasets/20250904T202854_cc5944cd/clean.csv"
        output_file = "/Users/david.rynes/Desktop/_DESKTOP/_CODE/statistiky/datasets/20250904T202854_cc5944cd/extracted_cloud.csv"
        print("⚠️ Používám hardcoded cesty - pro produkci předejte argumenty!")
    
    print(f"📂 CSV soubor: {csv_file}")
    print(f"📂 Výstupní soubor: {output_file}")
    
    if not os.path.exists(csv_file):
        print(f"❌ Vstupní soubor {csv_file} neexistuje.")
        return
    
    print("🚀" + "=" * 60)
    print("CLOUD-OPTIMALIZOVANÝ SKRIPT PRO EXTRAKCI Z NOVINKY.CZ")
    print("🚀" + "=" * 60)
    
    # Možnost limitovat počet videí pro testování
    max_videos = None
    if len(sys.argv) >= 4 and sys.argv[3].strip():
        try:
            max_videos = int(sys.argv[3])
            print(f"🔢 Limit videí: {max_videos}")
        except ValueError:
            print("⚠️ Neplatný limit videí, zpracovávám všechna")
    else:
        print("📊 Zpracovávám všechna videa (bez limitu)")
    
    # Možnost nastavit velikost dávky
    batch_size = 15  # Menší batch pro cloud
    if len(sys.argv) >= 5:
        try:
            batch_size = int(sys.argv[4])
            print(f"📦 Velikost dávky: {batch_size}")
        except ValueError:
            print("⚠️ Neplatná velikost dávky, používám default 15")
    
    # Vytvoření cloud-optimalizovaného extraktoru
    extractor = CloudOptimizedVideoInfoExtractor(
        csv_file, 
        output_file, 
        max_concurrent=1,  # Pouze 1 concurrent worker
        retry_failed=False,  # Bez retry pro jednoduchost
        batch_size=batch_size
    )
    
    # Spuštění cloud extrakce
    start_time = time.time()
    success = await extractor.run_concurrent(max_videos=max_videos)
    end_time = time.time()
    
    if success:
        print(f"\n⚡ CLOUD EXTRAKCE DOKONČENA za {end_time - start_time:.1f} sekund! ⚡")
        
        # Statistiky
        successful_extractions = 0
        failed_extractions = 0
        strategy_stats = {}
        
        for result in extractor.results:
            if result['Extrahované info'].startswith('Zdroj nenalezen'):
                failed_extractions += 1
            else:
                successful_extractions += 1
                strategy = result.get('Strategie', 'unknown')
                strategy_stats[strategy] = strategy_stats.get(strategy, 0) + 1
        
        total_videos = len(extractor.results)
        success_rate = (successful_extractions / total_videos * 100) if total_videos > 0 else 0
        
        print(f"📊 Cloud statistiky:")
        print(f"   • Celkem zpracováno: {total_videos} videí")
        print(f"   • ✅ Úspěšné extrakce: {successful_extractions} ({success_rate:.1f}%)")
        print(f"   • ⚠️  Neúspěšné extrakce: {failed_extractions} ({100-success_rate:.1f}%)")
        print(f"   • 🚫 Seznam.cz selhání: {extractor.seznam_failures}")
        print(f"   • ☁️ Cloud prostředí: RAILWAY/HEROKU optimalizováno")
        print(f"   • 📦 Batch velikost: {extractor.batch_size}")
        
        if strategy_stats:
            print(f"\n📈 Úspěšnost podle strategií:")
            for strategy, count in strategy_stats.items():
                print(f"   • {strategy}: {count} videí")
        
        if failed_extractions > 0:
            print(f"\n💡 Tip: Videa s 'Zdroj nenalezen' můžete dodatečně upravit v Dataset Editoru")
    else:
        print(f"\n❌ CLOUD EXTRAKCE SELHALA")

if __name__ == "__main__":
    try:
        asyncio.run(main())
        print("🏁 Cloud-optimalizovaný skript dokončen úspěšně")
    except Exception as e:
        print(f"❌ Kritická chyba: {e}")
        raise
    finally:
        print("🧹 Cleanup dokončen")
        sys.exit(0)
