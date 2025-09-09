#!/usr/bin/env python3
"""
Debug script to analyze Novinky.cz article structure and find correct selectors
"""

import asyncio
from playwright.async_api import async_playwright

async def debug_novinky_page():
    url = "https://www.novinky.cz/clanek/auto-skoda-poodhaluje-elektrickou-octavii-ostre-rezany-koncept-zaujme-i-netradicnimi-dvermi-40537197"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        print(f"🔍 Analyzing page: {url}")
        await page.goto(url)
        await page.wait_for_load_state('domcontentloaded')
        
        # Wait a bit for dynamic content
        await asyncio.sleep(3)
        
        print("\n📋 Page title:")
        title = await page.title()
        print(f"Title: {title}")
        
        print("\n🎥 Looking for video elements...")
        
        # Check various video-related selectors
        video_selectors = [
            'video',
            '[data-video]',
            '.video',
            '.merkur-widget',
            '.main-media',
            '.article-content video',
            '.rich-content video',
            'iframe[src*="video"]',
            'iframe[src*="merkur"]',
            '[class*="video"]',
            '[id*="video"]'
        ]
        
        for selector in video_selectors:
            try:
                elements = await page.query_selector_all(selector)
                if elements:
                    print(f"✅ Found {len(elements)} elements with selector: {selector}")
                    for i, elem in enumerate(elements):
                        # Get element info
                        tag_name = await elem.evaluate('el => el.tagName')
                        classes = await elem.evaluate('el => el.className')
                        src = await elem.evaluate('el => el.src || el.getAttribute("data-src") || ""')
                        text = await elem.evaluate('el => el.textContent?.slice(0, 100) || ""')
                        
                        print(f"  [{i}] {tag_name} | classes: {classes} | src: {src}")
                        if text.strip():
                            print(f"      text: {text.strip()}")
                else:
                    print(f"❌ No elements found for: {selector}")
            except Exception as e:
                print(f"❌ Error with selector {selector}: {e}")
        
        print("\n🏷️ Looking for source/author information...")
        
        # Check for source information
        source_selectors = [
            '.article-author',
            '.author',
            '.source',
            '[class*="author"]',
            '[class*="source"]',
            '.article-content p:contains("Video:")',
            '.article-content p:contains("Zdroj:")',
            '.video-gallery__media-source',
            '.main-media + *',
            '.main-media ~ *'
        ]
        
        for selector in source_selectors:
            try:
                if ':contains(' in selector:
                    # Skip pseudo-selectors for now
                    continue
                    
                elements = await page.query_selector_all(selector)
                if elements:
                    print(f"✅ Found {len(elements)} elements with selector: {selector}")
                    for i, elem in enumerate(elements):
                        tag_name = await elem.evaluate('el => el.tagName')
                        classes = await elem.evaluate('el => el.className')
                        text = await elem.evaluate('el => el.textContent?.slice(0, 200) || ""')
                        
                        print(f"  [{i}] {tag_name} | classes: {classes}")
                        if text.strip():
                            print(f"      text: {text.strip()}")
                else:
                    print(f"❌ No elements found for: {selector}")
            except Exception as e:
                print(f"❌ Error with selector {selector}: {e}")
        
        print("\n📄 Full article content structure:")
        
        # Get the main article content
        article_content = await page.query_selector('.article-content, .content, .rich-content')
        if article_content:
            # Get all child elements
            children = await article_content.query_selector_all('*')
            print(f"Found {len(children)} child elements in article content")
            
            for i, child in enumerate(children[:20]):  # First 20 elements
                tag_name = await child.evaluate('el => el.tagName')
                classes = await child.evaluate('el => el.className')
                text = await child.evaluate('el => el.textContent?.slice(0, 100) || ""')
                
                print(f"  [{i}] {tag_name} | classes: {classes}")
                if text.strip() and len(text.strip()) > 10:
                    print(f"      text: {text.strip()}")
        
        print("\n⏳ Keeping browser open for manual inspection...")
        print("Check the browser window and press Enter to continue...")
        input("Press Enter to close browser...")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(debug_novinky_page())
