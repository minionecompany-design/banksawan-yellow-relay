#!/usr/bin/env python3
"""Emulator QA: tap synthetic HOME buttons and verify Android receives exact
per-symbol ACTION_VIEW URI in a private, offline capture Activity.
This does NOT test installed TradingView app handoff or any market feed.
"""
import pathlib, re, subprocess, time
from xml.etree import ElementTree as ET

PACKAGE="id.banksawan.yellow.qa"
ACTIVITY="id.banksawan.yellow.clean.CleanMainActivity"
OUT=pathlib.Path("clean-rebuild/android/qa/screenshots")
OUT.mkdir(parents=True,exist_ok=True)

def adb(*args, raw=False):
    res=subprocess.run(["adb",*args],check=True,capture_output=True)
    return res.stdout if raw else res.stdout.decode(errors="replace")

def screenshot(tag):
    adb("shell","uiautomator","dump","/sdcard/window.xml")
    xml=adb("exec-out","cat","/sdcard/window.xml",raw=True)
    (OUT/(tag+".xml")).write_bytes(xml)
    (OUT/(tag+".png")).write_bytes(adb("exec-out","screencap","-p",raw=True))
    return ET.fromstring(xml)

def text_nodes(root):
    return [n.attrib.get("text","") for n in root.iter("node")]

def find_button(root,symbol):
    for n in root.iter("node"):
        if n.attrib.get("content-desc")==("QA_CHART_"+symbol):
            b=n.attrib.get("bounds","")
            m=re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",b)
            if m:
                return ((int(m.group(1))+int(m.group(3)))//2,
                        (int(m.group(2))+int(m.group(4)))//2)
    return None

def run_sequence(reversed_order):
    suffix="reverse" if reversed_order else "normal"
    adb("shell","am","force-stop",PACKAGE)
    adb("shell","am","start","-n",PACKAGE+"/"+ACTIVITY,
        "--ez","yellow.qa.fixture","true",
        "--ez","yellow.qa.reversed",str(reversed_order).lower())
    time.sleep(2)
    home=screenshot("chart-"+suffix+"-home")
    t=" ".join(text_nodes(home))
    assert "SIMULASI QA" in t, ("NO_QA_DISCLAIMER",t)
    for symbol in ["PLAYUSDT","FOGOUSDT"]:
        button=None
        for attempt in range(6):
            tree=screenshot("chart-"+suffix+"-"+symbol+"-before-"+str(attempt))
            button=find_button(tree,symbol)
            if button:
                break
            size=adb("shell","wm","size")
            dims=re.search(r"(?:Override|Physical) size: (\\d+)x(\\d+)",size)
            assert dims, ("UNKNOWN_EMULATOR_SIZE",size)
            width,height=int(dims.group(1)),int(dims.group(2))
            adb("shell","input","swipe",str(width//2),str(int(height*.78)),str(width//2),str(int(height*.28)),"350")
            time.sleep(.4)
        assert button, ("QA_CHART_BUTTON_NOT_VISIBLE",symbol)
        adb("shell","input","tap",str(button[0]),str(button[1]))
        time.sleep(.8)
        captured=screenshot("chart-"+suffix+"-"+symbol+"-captured")
        target=" ".join(text_nodes(captured))
        expected="BINANCE:"+symbol+".P"
        assert "QA INTENT CAPTURE" in target, ("NO_ANDROID_INTENT_RECEIVER",symbol,target)
        assert expected in target, ("WRONG_CHART_SYMBOL",expected,target)
        other="FOGOUSDT" if symbol=="PLAYUSDT" else "PLAYUSDT"
        assert "BINANCE:"+other+".P" not in target, ("CROSSED_CHART_IDENTITY",symbol,target)
        adb("shell","input","keyevent","4")
        time.sleep(.4)
    print("QA_CHART_INTENT_PASS",suffix)

run_sequence(False)
run_sequence(True)
print("QA_CHART_INTENT_PLAY_FOGO_ORDER_INDEPENDENT_PASS")
