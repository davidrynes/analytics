#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ENHANCED Playwright skript pro rychlé vyhledávání videí s více strategiemi.
- Seznam.cz search (původní)
- Přímá URL konstrukce na základě názvu
- Google search jako fallback
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

class EnhancedVideoInfoExtractor:
    def __init__(self, csv_file, output_file, max_concurrent=2, retry_failed=True, batch_size=50):
        self.csv_file = csv_file
        self.output_file = output_file
        self.data = None
        self.results = []
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.progress_file = "progress.json"
        self.retry_failed = retry_failed
        self.failed_videos = []
        self.batch_size = batch_size
        
        # Seznam různých User-Agent pro rotaci
        self.user_agents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ]
        
        # Index pro rotaci User-Agent
        self.current_user_agent_index = 0
        
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

    def slugify(self, text):
        """Převede text na URL-friendly slug."""
        # Normalizace unicode
        text = unicodedata.normalize('NFD', text)
        # Odstranění diakritiky
        text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
        # Převod na malá písmena
        text = text.lower()
        # Nahrazení speciálních znaků
        text = re.sub(r'[^\w\s-]', '', text)
        # Nahrazení mezer a více pomlček jednou pomlčkou
        text = re.sub(r'[-\s]+', '-', text)
        # Odstranění pomlček na začátku a konci
        text = text.strip('-')
        return text

    def create_novinky_url(self, rubrika, nazev):
        """Pokusí se sestavit URL na Novinky.cz na základě rubriky a názvu."""
        # Mapování rubrik na URL segmenty
        rubrika_mapping = {
            'Domácí': 'domaci',
            'Zahraniční': 'zahranicni',
            'Krimi': 'krimi', 
            'Ekonomika': 'ekonomika',
            'Koktejl': 'koktejl',
            'Evropa': 'zahranicni-evropa',
            'Amerika': 'zahranicni-amerika',
            'Svět': 'zahranicni',
            'Válka na Ukrajině': 'zahranicni-valka-na-ukrajine',
            'Blízký a Střední východ': 'zahranicni-blizky-a-stredni-vychod',
            'Počasí': 'pocasi',
            'Věda a školy': 'veda-a-skoly',
            'Cestování': 'cestovani',
            'AutoMoto': 'automoto',
            'Zdraví': 'zdravi',
            'Film': 'film',
            'Kultura': 'kultura',
            'TV a streaming': 'tv-a-streaming',
            'Hudba': 'hudba',
            'Lifestyle': 'lifestyle',
            'Bydlení': 'bydleni',
            'Móda a kosmetika': 'moda-a-kosmetika',
            'Gastro': 'gastro',
            'Zahrada': 'zahrada',
            'Software': 'software',
            'Internet a PC': 'internet-a-pc',
            'Mobil': 'mobil',
            'Hardware': 'hardware',
            'AI': 'ai',
            'Hry a herní systémy': 'hry-a-herni-systemy',
        }
        
        # Získání URL segmentu pro rubriku
        rubrika_slug = rubrika_mapping.get(rubrika, self.slugify(rubrika))
        
        # Vytvoření slug z názvu
        nazev_slug = self.slugify(nazev)
        
        # Konstrukce URL
        # Novinky.cz používá formát: /clanek/rubrika-nazev-ID
        # Nemáme ID, takže zkusíme bez něj
        possible_urls = [
            f"https://www.novinky.cz/clanek/{rubrika_slug}-{nazev_slug}",
            f"https://www.novinky.cz/{rubrika_slug}/{nazev_slug}",
        ]
        
        return possible_urls

    async def search_on_seznam(self, page, query, max_retries=2):
        """Vyhledávání na Seznam.cz s retry mechanismem."""
        for attempt in range(max_retries):
            try:
                search_query = f"{query} site:novinky.cz"
                encoded_query = urllib.parse.quote(search_query)
                search_url = f"https://search.seznam.cz/?q={encoded_query}"
                
                await page.goto(search_url, wait_until="domcontentloaded", timeout=8000)
                await page.wait_for_timeout(300)
                return True
                
            except Exception as e:
                print(f"Seznam.cz pokus {attempt + 1}/{max_retries} selhal: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.5)
                    continue
                return False

    async def search_on_google(self, page, query, max_retries=2):
        """Fallback vyhledávání na Google."""
        for attempt in range(max_retries):
            try:
                search_query = f"{query} site:novinky.cz"
                encoded_query = urllib.parse.quote(search_query)
                search_url = f"https://www.google.com/search?q={encoded_query}"
                
                await page.goto(search_url, wait_until="domcontentloaded", timeout=8000)
                await page.wait_for_timeout(500)
                return True
                
            except Exception as e:
                print(f"Google pokus {attempt + 1}/{max_retries} selhal: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.5)
                    continue
                return False

    async def find_novinky_link_on_seznam(self, page, video_title):
        """Hledání odkazu na Novinky.cz na Seznam.cz."""
        try:
            novinky_links = page.locator("a[href*='novinky.cz']")
            
            if await novinky_links.count() > 0:
                best_link = None
                best_score = 0
                
                for i in range(min(await novinky_links.count(), 10)):
                    link = novinky_links.nth(i)
                    href = await link.get_attribute("href")
                    
                    if href and 'novinky.cz' in href and ('/clanek/' in href or '/video/' in href):
                        link_text = await link.text_content()
                        if link_text:
                            score = self.calculate_similarity(video_title.lower(), link_text.lower())
                            if score > best_score:
                                best_score = score
                                best_link = href
                
                if best_link and best_score > 0.1:
                    return best_link
                    
            return None
                
        except Exception as e:
            print(f"Chyba při hledání odkazu na Seznam.cz: {e}")
            return None

    async def find_novinky_link_on_google(self, page, video_title):
        """Hledání odkazu na Novinky.cz na Google."""
        try:
            # Google používá jiné selektory
            result_links = page.locator("a[href*='novinky.cz']")
            
            if await result_links.count() > 0:
                best_link = None
                best_score = 0
                
                for i in range(min(await result_links.count(), 5)):
                    link = result_links.nth(i)
                    href = await link.get_attribute("href")
                    
                    if href and 'novinky.cz' in href and ('/clanek/' in href or '/video/' in href):
                        # Google někdy wrappuje URLs
                        if href.startswith('/url?q='):
                            href = urllib.parse.unquote(href.split('/url?q=')[1].split('&')[0])
                        
                        link_text = await link.text_content()
                        if link_text:
                            score = self.calculate_similarity(video_title.lower(), link_text.lower())
                            if score > best_score:
                                best_score = score
                                best_link = href
                
                if best_link and best_score > 0.1:
                    return best_link
                    
            return None
                
        except Exception as e:
            print(f"Chyba při hledání odkazu na Google: {e}")
            return None
    
    def calculate_similarity(self, text1, text2):
        """Rychlý výpočet podobnosti."""
        words1 = set(text1.split()[:10])
        words2 = set(text2.split()[:10])
        
        if not words1 or not words2:
            return 0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union) if union else 0

    async def test_direct_urls(self, page, possible_urls):
        """Testuje přímé URLs a vrátí první funkční."""
        for url in possible_urls:
            try:
                print(f"🔗 Zkouším přímé URL: {url}")
                response = await page.goto(url, wait_until="domcontentloaded", timeout=5000)
                if response and response.status == 200:
                    print(f"✅ Přímé URL funguje: {url}")
                    return url
            except Exception as e:
                print(f"❌ Přímé URL nefunguje: {url} - {e}")
                continue
        return None

    async def extract_video_info(self, page, novinky_url, max_retries=2):
        """Extrakce informací z Novinky.cz."""
        for attempt in range(max_retries):
            try:
                print(f"🌐 Načítám stránku: {novinky_url}")
                await page.goto(novinky_url, wait_until="domcontentloaded", timeout=15000)
                await page.wait_for_timeout(1000)
                print(f"✅ Stránka načtena úspěšně")
                
                # Rychlé přijetí cookies
                if attempt == 0:
                    try:
                        cookie_button = page.locator("button[data-testid='cw-button-agree-with-ads'], button:has-text('Souhlasím')")
                        if await cookie_button.count() > 0:
                            await cookie_button.click()
                            await page.wait_for_timeout(300)
                    except:
                        pass
                
                # Hledání zdrojů s rozšířenými selektory
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
                ]
                
                for selector in selectors_to_try:
                    try:
                        elements = page.locator(selector)
                        count = await elements.count()
                        print(f"🔍 Zkouším selektor '{selector}': nalezeno {count} elementů")
                        
                        if count > 0:
                            for i in range(min(count, 3)):
                                element = elements.nth(i)
                                text = await element.text_content()
                                print(f"   Element {i}: '{text}'")
                                
                                if text and len(text.strip()) > 0:
                                    clean_text = text.strip()
                                    
                                    if 3 <= len(clean_text) <= 200:
                                        # Odstranění prefixů
                                        for prefix in ['Video:', 'Foto:', 'Zdroj:', 'Autor:']:
                                            if clean_text.startswith(prefix):
                                                clean_text = clean_text[len(prefix):].strip()
                                        
                                        if clean_text and len(clean_text) > 2:
                                            print(f"🎯 Nalezen zdroj pomocí '{selector}': {clean_text[:50]}...")
                                            return clean_text
                                            
                    except Exception as e:
                        print(f"❌ Chyba při zkoušení selektoru '{selector}': {e}")
                        continue
                
                # Hledání podle klíčových slov
                common_sources = ['ČT24', 'ČTK', 'Reuters', 'AP', 'DPA', 'AFP', 'iStock', 'Shutterstock', 'Getty', 'Profimedia']
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
                    await asyncio.sleep(0.3)
                    continue
                    
        print(f"Extrakce selhala po {max_retries} pokusech")
        return None

    async def process_video_worker(self, page, index, row):
        """Worker pro zpracování jednoho videa s více strategiemi."""
        async with self.semaphore:
            video_title = row['Název článku/videa']
            rubrika = row['Jméno rubriky']
            print(f"[{index+1}] Zpracovávám: {video_title[:50]}...")
            
            extracted_info = None
            novinky_url = ""
            extraction_status = "success"
            strategy_used = ""
            
            try:
                # STRATEGIE 1: Seznam.cz search
                print(f"🔍 Strategie 1: Seznam.cz search")
                if await self.search_on_seznam(page, video_title):
                    novinky_url = await self.find_novinky_link_on_seznam(page, video_title)
                    if novinky_url:
                        extracted_info = await self.extract_video_info(page, novinky_url)
                        if extracted_info:
                            strategy_used = "seznam_search"
                            print(f"✅ [{index+1}] Úspěch přes Seznam.cz")
                
                # STRATEGIE 2: Přímá URL konstrukce
                if not extracted_info:
                    print(f"🔗 Strategie 2: Přímá URL konstrukce")
                    possible_urls = self.create_novinky_url(rubrika, video_title)
                    direct_url = await self.test_direct_urls(page, possible_urls)
                    if direct_url:
                        extracted_info = await self.extract_video_info(page, direct_url)
                        if extracted_info:
                            novinky_url = direct_url
                            strategy_used = "direct_url"
                            print(f"✅ [{index+1}] Úspěch přes přímé URL")
                
                # STRATEGIE 3: Google search fallback
                if not extracted_info:
                    print(f"🌐 Strategie 3: Google search")
                    if await self.search_on_google(page, video_title):
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
            
            # Určení finálního zdroje na základě statusu
            if extraction_status == "success" and extracted_info:
                clean_extracted_info = extracted_info
            else:
                clean_extracted_info = "Zdroj nenalezen - všechny strategie selhaly"
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
            
            # Logování podle statusu
            if extraction_status == "success":
                print(f"✅ [{index+1}] Hotovo: {extracted_info[:30] if extracted_info else 'N/A'}...")
            else:
                print(f"⚠️ [{index+1}] Uloženo s chybou: {clean_extracted_info[:50]}...")
            
            # Aktualizace progress
            self.update_progress(len(self.results), len(self.data), "processing")
            
            # Průběžné ukládání každých 10 videí
            if len(self.results) % 10 == 0:
                await self.save_results()
                print(f"💾 Průběžné uložení - {len(self.results)} videí")
            
            # Anti-bot čekání
            await asyncio.sleep(random.uniform(2, 4))  # Trochu delší čekání kvůli více strategiím
            
            return result

    async def process_batch(self, browser, batch_data, batch_number, total_batches):
        """Zpracuje jednu dávku videí."""
        print(f"📦 Zpracovávám dávku {batch_number}/{total_batches} ({len(batch_data)} videí)")
        
        # Vytvoření více pages pro concurrent processing v dávce
        pages = []
        for i in range(self.max_concurrent):
            context = await browser.new_context(user_agent=self.get_next_user_agent())
            page = await context.new_page()
            pages.append(page)
        
        try:
            # Rozdělení práce mezi pages v dávce
            tasks = []
            for idx, (index, row) in enumerate(batch_data.iterrows()):
                page_index = idx % len(pages)
                page = pages[page_index]
                task = self.process_video_worker(page, index, row)
                tasks.append(task)
            
            # Spuštění tasků v dávce s timeout
            try:
                batch_timeout = min(20*60, 30*60 // total_batches)  # Max 20 minut na dávku
                results = await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=batch_timeout
                )
            except asyncio.TimeoutError:
                print(f"⏰ Timeout dávky {batch_number} po {batch_timeout//60} minutách")
                results = []
            
            completed_count = len([r for r in results if r is not None and not isinstance(r, Exception)])
            print(f"✅ Dávka {batch_number}/{total_batches} dokončena! Zpracováno {completed_count}/{len(batch_data)} videí")
            
            # Uložení po každé dávce
            await self.save_results()
            
            return completed_count
            
        finally:
            # Uzavření pages v dávce
            for page in pages:
                try:
                    await page.close()
                except:
                    pass

    async def run_concurrent(self, max_videos=None):
        """Spustí BATCH zpracování po dávkách s enhanced strategiemi."""
        if not await self.load_data():
            return False
        
        data_to_process = self.data
        if max_videos:
            data_to_process = self.data.head(max_videos)
        
        # Rozdělení na dávky
        total_videos = len(data_to_process)
        total_batches = (total_videos + self.batch_size - 1) // self.batch_size
        
        print(f"🚀 Spouštím ENHANCED BATCH zpracování {total_videos} videí")
        print(f"📦 Rozděleno na {total_batches} dávek po {self.batch_size} videích")
        print(f"⚙️  {self.max_concurrent} concurrent workers na dávku")
        print(f"🔧 Strategie: 1) Seznam.cz, 2) Přímé URL, 3) Google search")
        
        # Inicializace progress
        self.update_progress(0, total_videos, "starting", "Spouštím enhanced batch zpracování...")
        
        async with async_playwright() as p:
            # Detekce prostředí
            is_cloud = (
                os.environ.get('RAILWAY_ENVIRONMENT') or 
                os.environ.get('NODE_ENV') == 'production' or
                os.environ.get('PORT') or
                os.environ.get('RAILWAY_STATIC_URL') or
                os.environ.get('RAILWAY_DEPLOYMENT_ID') or
                os.environ.get('RAILWAY_PROJECT_ID') or
                os.environ.get('DYNO')
            )
            
            print(f"🌐 Detekce prostředí: is_cloud={is_cloud}")
            
            if is_cloud:
                print("☁️ Spouštím v CLOUD režimu (headless=True)")
                browser = await p.chromium.launch(
                    headless=True, 
                    slow_mo=300,
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
                    ]
                )
            else:
                print("💻 Spouštím v LOKÁLNÍM režimu (headless=False)")
                browser = await p.chromium.launch(headless=False, slow_mo=500)
            
            try:
                # Zpracování po dávkách
                for batch_num in range(total_batches):
                    start_idx = batch_num * self.batch_size
                    end_idx = min(start_idx + self.batch_size, total_videos)
                    
                    # Získání dávky dat
                    batch_data = data_to_process.iloc[start_idx:end_idx]
                    
                    print(f"\n📦 === DÁVKA {batch_num + 1}/{total_batches} ===")
                    print(f"📊 Videí v dávce: {len(batch_data)} (indexy {start_idx}-{end_idx-1})")
                    print(f"📈 Celkový pokrok: {len(self.results)}/{total_videos} videí")
                    
                    # Zpracování dávky
                    batch_processed = await self.process_batch(browser, batch_data, batch_num + 1, total_batches)
                    
                    # Aktualizace celkového progressu
                    self.update_progress(
                        len(self.results), 
                        total_videos, 
                        "processing", 
                        f"Dokončena dávka {batch_num + 1}/{total_batches}. Zpracováno {len(self.results)} videí."
                    )
                    
                    # Pauza mezi dávkami
                    if batch_num < total_batches - 1:
                        print(f"⏸️  Pauza 5s mezi dávkami...")
                        await asyncio.sleep(5)
                
                print(f"\n✅ VŠECHNY DÁVKY DOKONČENY!")
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
        output_file = "/Users/david.rynes/Desktop/_DESKTOP/_CODE/statistiky/datasets/20250904T202854_cc5944cd/extracted_enhanced.csv"
        print("⚠️ Používám hardcoded cesty - pro produkci předejte argumenty!")
    
    print(f"📂 CSV soubor: {csv_file}")
    print(f"📂 Výstupní soubor: {output_file}")
    
    if not os.path.exists(csv_file):
        print(f"❌ Vstupní soubor {csv_file} neexistuje.")
        return
    
    print("🚀" + "=" * 60)
    print("ENHANCED SKRIPT PRO EXTRAKCI Z NOVINKY.CZ")
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
    batch_size = 30  # Menší batch kvůli více strategiím
    if len(sys.argv) >= 5:
        try:
            batch_size = int(sys.argv[4])
            print(f"📦 Velikost dávky: {batch_size}")
        except ValueError:
            print("⚠️ Neplatná velikost dávky, používám default 30")
    
    # Vytvoření enhanced extraktoru
    extractor = EnhancedVideoInfoExtractor(
        csv_file, 
        output_file, 
        max_concurrent=2,  # Méně concurrent workers kvůli složitějším strategiím
        retry_failed=False,  # Vypneme retry, máme už 3 strategie
        batch_size=batch_size
    )
    
    # Spuštění enhanced extrakce
    start_time = time.time()
    success = await extractor.run_concurrent(max_videos=max_videos)
    end_time = time.time()
    
    if success:
        print(f"\n⚡ ENHANCED EXTRAKCE DOKONČENA za {end_time - start_time:.1f} sekund! ⚡")
        
        # Spočítáme statistiky úspěšných a neúspěšných extrakcí
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
        
        print(f"📊 Statistiky:")
        print(f"   • Celkem zpracováno: {total_videos} videí")
        print(f"   • ✅ Úspěšné extrakce: {successful_extractions} ({success_rate:.1f}%)")
        print(f"   • ⚠️  Neúspěšné extrakce: {failed_extractions} ({100-success_rate:.1f}%)")
        print(f"   • 🌐 Prostředí: {'CLOUD' if os.environ.get('PORT') else 'LOKÁLNÍ'}")
        print(f"   • 📦 Batch velikost: {extractor.batch_size}")
        
        if strategy_stats:
            print(f"\n📈 Úspěšnost podle strategií:")
            for strategy, count in strategy_stats.items():
                print(f"   • {strategy}: {count} videí")
        
        if failed_extractions > 0:
            print(f"\n💡 Tip: Videa s 'Zdroj nenalezen' můžete dodatečně upravit v Dataset Editoru")
    else:
        print(f"\n❌ EXTRAKCE SELHALA")

if __name__ == "__main__":
    try:
        asyncio.run(main())
        print("🏁 Enhanced skript dokončen úspěšně")
    except Exception as e:
        print(f"❌ Kritická chyba: {e}")
        raise
    finally:
        print("🧹 Cleanup dokončen")
        sys.exit(0)
