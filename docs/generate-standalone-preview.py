"""Build a zero-server, zero-network local preview of two YELLOW tabs."""
from pathlib import Path
import base64
root=Path(__file__).resolve().parents[1]
public=root/'scanner/public'
html=(public/'index.html').read_text()
css=(public/'styles.css').read_text()
js=(public/'app.js').read_text()
icon=base64.b64encode((public/'assets/yellow-icon.png').read_bytes()).decode()
data_url='data:image/png;base64,'+icon
html=html.replace('<link rel="icon" href="/assets/yellow-icon.png"/>',f'<link rel="icon" href="{data_url}"/>')
html=html.replace('<link rel="stylesheet" href="/styles.css"/>','<style>'+css+'</style>')
html=html.replace('<script defer src="/app.js"></script>','')
html=html.replace('src="/assets/yellow-icon.png"',f'src="{data_url}"')
stub='''
// Demo fixtures only. No network calls occur; only TradingView shortcut opens
// when the user deliberately taps the button.
const sampleStart=Date.now();
const demoHome=[
 {id:'DEMO_WAL',symbol:'WALUSDT',signal:'LONG_A',timeframe:'15m',price:0.05123,binance24hChangePct:5.8,priority:'HIGH',firstSeenMs:sampleStart-35*60000,homeExpiresMs:sampleStart+23*3600000+25*60000,status:'DEMO_ONLY'},
 {id:'DEMO_ARC',symbol:'ARCUSDT',signal:'LONG_A',timeframe:'1m',price:0.03741,binance24hChangePct:2.7,priority:'STANDARD',firstSeenMs:sampleStart-97*60000,homeExpiresMs:sampleStart+22*3600000+23*60000,status:'DEMO_ONLY'}
];
const demoUniverse=[
 {symbol:'WALUSDT',price:0.05123,binance24hChangePct:5.8,priority:'HIGH'},
 {symbol:'ARCUSDT',price:0.03741,binance24hChangePct:2.7,priority:'STANDARD'},
 {symbol:'NILUSDT',price:0.08511,binance24hChangePct:1.5,priority:'STANDARD'}
];
window.fetch=async path=>({json:async()=>path==='/api/home'?{home:demoHome.filter(x=>x.homeExpiresMs>Date.now()),mode:'DEMO_OFFLINE'}:{universe:demoUniverse,mode:'DEMO_OFFLINE'}});
'''
html=html.replace('</body>', '<script>\n'+stub+'\n'+js+'\n</script>\n</body>')
output=root.parent/'banksawan-yellow-preview-offline.html'
output.write_text(html)
print(output)
