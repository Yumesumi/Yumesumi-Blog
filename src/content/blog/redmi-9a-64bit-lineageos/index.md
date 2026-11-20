---
title: 给红米 9A 刷 64 位系统：两次失败、一次回滚，和那个被跳过的 40MB 固件包
description: 一台 2020 年的红米 9A，32 位系统已经装不上新版微信。刷 64 位 LineageOS 的第一轮很"成功"，直到发现打不了电话。真正的原因是一个 40MB 的固件补丁——我为了"保住国行 modem"跳过了它。
tags: ['技术', 'Android', '刷机']
date: 2026-11-20
---

家里有台红米 9A（代号 `dandelion`，型号 M2006C3LC），2020 年买的，4GB + 128GB，联发科 G25。放着吃灰很久了，想捡起来当备用机——结果发现微信和 QQ 的新版本都已经停止支持 32 位系统，旧版本又登不上。这台机器的 MIUI 12.5 是 ARM32 的系统，`ro.product.cpu.abi` 就是 `armeabi-v7a`。

于是有了这个周末的项目：把它刷成 64 位。

前后折腾了两轮，中间完整回滚过一次 MIUI。最后成功了，但过程中有个判断错误值得单独拎出来讲——**我为了"保护国行 modem"跳过了一个 40MB 的固件包，而这个包恰恰是能不能打电话的关键**。

## 一、先把地形摸清楚

目标机型的关键事实：

| 项 | 值 |
| --- | --- |
| 代号 / 型号 | `dandelion` / M2006C3LC |
| SoC | MediaTek MT6762G（Helio G25），**硬件本身支持 arm64** |
| 出厂系统 | MIUI 12.5.21.0.RCDCNXM（Android 11） |
| 分区方案 | A-only + 动态分区（有 `super`） |
| Bootloader | 已解锁 |

ROM 选 LineageOS 22.2（Android 15，非官方 `blossom` 构建）。选它而不是 crDroid 12.x（Android 16）的理由很朴素：4GB 内存，A15 比 A16 轻。

One more thing：这台机器的 ROM 社区把它和 `angelica` / `cattail` 等几个 9A/9i 变体合并成 `blossom` 统一构建，所以 ROM 的 `post-build` 里写的是 `blossom`，`pre-device` 里则包含 `dandelion`。刷之前必须核对这一点，不然会被 assert 拦住。

## 二、第一轮：一切"成功"，除了打不了电话

流程很标准：原厂 fastboot 包打底 → 刷 OrangeFox recovery → Format Data → 刷 ROM → 刷 NikGapps → 重启。

验收数据看起来完美：

```text
ro.product.cpu.abi      = arm64-v8a          ← 目的达成
ro.product.cpu.abilist  = arm64-v8a,armeabi-v7a,armeabi
ro.build.version.release = 15
gsm.version.baseband    = MOLY.LR12A.R3.MP.V134.1.P78   ← 和刷机前一模一样
```

基带版本号和刷机前完全一致，这意味着 `modem` 分区一个字节都没被动过——这是当时我特意设计的"安全策略"：Lineage 的 OTA 包里没有 `firmware-update` 目录，理论上不会碰 modem。

流量正常、短信正常、相机正常、Play 商店正常。然后发现：**打不了电话，也接不到**。

拨号后界面一直停在"正在呼叫"，十几秒后无声失败。对方打进来也完全没反应。

## 三、把能查的都查了一遍

电话不通但流量和短信通，这是一个很具体的故障形态。第一个怀疑对象是 VoLTE。

联通这边 3G 已经在陆续退网，很多地方只剩 LTE。没有 VoLTE 就等于没有语音通道。于是开始逐项排查：

| 检查项 | 结果 |
| --- | --- |
| 网络注册 | LTE，`mVoiceRegState=0(IN_SERVICE)`，`availableServices=[VOICE]` |
| 订阅信息 | subId=1、slot 0、460/01、`isEnhanced4GModeEnabled=1` |
| VoLTE 开关 | 已打开，modem 日志确认收到 `triggerImsCfg volte:1` |
| IMS APN | **缺**。Lineage 的 `apns-conf.xml` 里一条中国运营商都没有（3963 行全是海外的） |
| 运营商配置 | `carrier_volte_available_bool = true` |
| MTK IMS 守护进程 | `volte_imsm_93`、`volte_md_status`、`volte_stack`、`volte_ua`、`volte_imcb` 全在跑 |
| `com.mediatek.ims` 进程 | 在跑 |
| 崩溃日志 | 空的，IMS 没崩 |

缺 IMS APN 是个真问题，我手工插了一条进去：

```bash
adb root
adb shell content insert --uri content://telephony/carriers \
  --bind name:s:IMS --bind numeric:s:46001 --bind mcc:s:460 --bind mnc:s:01 \
  --bind apn:s:ims --bind type:s:ims --bind protocol:s:IPV4V6 \
  --bind roaming_protocol:s:IPV4V6 --bind carrier_enabled:i:1 \
  --bind user_visible:i:1 --bind user_editable:i:1 --bind edited:i:1
```

插进去了，重启，还是打不通。

真正的线索在日志里：

```text
CallWaitingCtrl: setImsRegistrationState prev=false, new=false
```

**IMS 从来没注册成功过**，一次都没成功。而且拨号时观察语音制式，始终是 `getRilVoiceRadioTechnology=14(LTE)`——modem 完全没有回落 3G/2G 的意思。

这就说通了：`persist.dbg.volte_avail_ovr=1` 这类调试属性让系统认为"VoLTE 可用"，于是它一直走 IMS 路径死等注册；而 IMS 起不来，语音通道就彻底断了，也不会有 CS 回落兜底。想把这类属性改掉（`persist.dbg.*`）被 SELinux 挡住了：

```text
Failed to set property 'persist.dbg.volte_avail_ovr' to '0'.
```

## 四、换一个 ROM 验证

单看一个 ROM 说不清是"这个包有 bug"还是"这类 ROM 都不行"，于是换了 crDroid 12.12（Android 16）。

结果**症状一模一样**：`state=DIALING` 卡死、语音制式不离 LTE、IMS 不注册。

有意思的是 crDroid 的 APN 反而是对的（自带 `联通IMS / ims / type=ims`），说明 APN 不是根因。两套完全不同的 ROM（A15 vendor 2025-06 / A16 vendor 2025-12）表现完全一致，这就基本排除了"某个 ROM 的偶发 bug"。

当时的结论是：**AOSP 侧的 IMS 实现跟国行 A11 modem 对不上**，属于结构性问题。想验证这个判断需要改 `persist.dbg.*`，但两套 ROM 都是 user 版本，`setprop` 被拦，改不动。

于是我做了个决定：**回滚 MIUI**。语音是手机的第一需求，64 位带来的 App 兼容性补不上"打不了电话"这个洞。

回滚很顺利。原厂包 3.9GB，从 `cdnorg.d.miui.com` 拉的，单线程只有 15KB/s，最后用 8 线程分段拉到 5MB/s，二十来分钟下完，MD5 `f9cc332c8527c331c63163d63db4cb4f` 校验通过。刷完电话立刻就能打——**证明硬件、SIM、运营商侧全部正常**。

## 五、转折：那个被跳过的 40MB

回滚之后开始查社区资料，看到红米 9A 的 64 位刷机教程里明确写了一步：

> **刷电信补丁** —— 不刷的话会导致电话和短信用不了，其他运营商也建议刷，可以解决一些玄学 bug。
> 补丁：`fw_dandelion_miui_..._V12.5.9.0.zip`

而这个文件，就是 crDroid 官方放在 `blossom/12.x/firmware/` 目录下的那个 `fw_dandelion_V12.5.9.0.RCDINXM.zip`。40MB。

我当时在预检脚本里特意写了"跳过 `firmware/`，避免替换国行 modem"——**这个决定就是病根**。

把包拆开看，它写入的镜像是：

```text
md1img.img (modem) · lk · lk2 · tee · tee2 · scp · scp2 · sspm · spmfw · preloader(boot0/boot1)
```

再看版本：

| 来源 | modem 版本 |
| --- | --- |
| 国行原厂 12.5.21 | `MOLY.LR12A.R3.MP.V134.1.P78` |
| 这个补丁（印尼 Global 12.5.9） | `MOLY.LR12A.R3.MP.V134.1.P72` |

**P72 比 P78 旧。** 这就是让我误判的地方——直觉上"版本更新 = 更好"，于是把一个"降级"的固件包排除掉了。

但定制 ROM 的固件层不是这么算的：它要的是**跟 ROM 开发时对齐的那一套**，而不是绝对版本最高的那一套。这个补丁的作用不是让 modem 变强，而是让 ROM 的 vendor 和 modem 讲同一种语言。IMS 注册失败，就是两边语言不通。

## 六、第二轮：加一步，通了

重刷流程和第一轮完全一样，只多了一条命令：

```bash
twrp install /sdcard/lineage-22.2-...blossom.zip     # ROM
twrp install /sdcard/fw_dandelion_V12.5.9.0.RCDINXM.zip  # 固件补丁 ← 新增的这一步
twrp install /sdcard/NikGapps-core-arm64-15-...zip   # GApps
```

补丁刷完后重启，拨 10010——**通了**。

```text
gsm.version.baseband = MOLY.LR12A.R3.MP.V134.1.P72,P72
ro.product.cpu.abi   = arm64-v8a
ro.build.version.release = 15
```

64 位、通话、Android 15，三个都要到了。

## 七、第二个坑：在 Android 里改 `/system_ext` 会被静默丢弃

GApps 用的是 NikGapps Core。刷完发现 Google Play 服务无限崩溃：

```text
java.lang.IllegalStateException: unable to create GSF context on SDK_INT 35
  Caused by: PackageManager$NameNotFoundException: Application package com.google.android.gsf not found
```

`com.google.android.gsf` 没装上。原因：GSF、日历同步、通讯录同步这三个包在 NikGapps 里的安装目标是 `system_ext`，而安装时那个分区没有挂载成功——权限文件写进去了，apk 没落盘。

手工补的时候踩了第二个坑，这个坑比第一个更隐蔽：

```bash
adb root
adb shell mount -o rw,remount /system_ext   # 成功
adb shell cp foo.apk /system_ext/priv-app/xxx/  # 成功
adb shell sync                              # 不报错
adb shell ls -l /system_ext/priv-app/xxx/   # 文件在
```

**一重启，文件就没了。**

中间做过对照实验：写入后 `echo 3 > /proc/sys/vm/drop_caches`，文件还在；但重启后消失。说明 ext4 把这些页标记成了"已同步"，实际根本没写进 `super` 分区——底层 dm 设备拒绝了写，而内核没有把错误传上来。

结论很明确：**动态分区（`system_ext` / `product`）只能在 recovery 里用 TWRP/OrangeFox 写，开机状态下写不进去，而且不会报错。**

改到 OrangeFox 里操作，一次成功：

```bash
adb push GoogleServicesFramework.apk /tmp/
adb shell '
mkdir -p /system_ext/priv-app/GoogleServicesFramework
cp /tmp/GoogleServicesFramework.apk /system_ext/priv-app/GoogleServicesFramework/
chmod 755 /system_ext/priv-app/GoogleServicesFramework
chmod 644 /system_ext/priv-app/GoogleServicesFramework/*.apk
restorecon -R /system_ext/priv-app/GoogleServicesFramework
sync'
```

重启后三个包全部被系统识别：

```text
com.google.android.gsf                       package:/system_ext/priv-app/GoogleServicesFramework/...
com.google.android.syncadapters.calendar     package:/system_ext/app/GoogleCalendarSyncAdapter/...
com.google.android.syncadapters.contacts     package:/system_ext/app/GoogleContactsSyncAdapter/...
```

Play 商店正常弹出登录页，崩溃计数 0。

## 八、顺带解决的一个驱动问题

刷机第一步 `fastboot devices` 就卡住了：设备能枚举，但报 Code 39。查下来是设备在 fastboot 模式下的 ID 是 `18D1:D00D`（AOSP 公版 bootloader ID），而这台 Windows 上它绑在一个文件已经丢失的旧 BBK 版 `android_usb.inf` 上。

顺手把 Google USB 驱动的 r11 / r12 / r13 全拆了看了一遍：**都不含 `18D1:D00D` 这个 PID**。最后在小米解锁工具包里找到 `driver/win10/android_winusb.inf`，里面明写着：

```text
%SingleBootLoaderInterface% = USB_Install, USB\VID_18D1&PID_D00D   ;bootloader
```

装完自动绑成 `oem74.inf`，`fastboot devices` 立刻认到。以后遇到"设备管理器里没有黄色感叹号、但 fastboot 就是不认"的情况，可以先查一下 HAL 层实际枚举的 VID/PID，再去找对应的签名驱动，比盲目装 Google 驱动有效。

## 九、可复用的完整流程

踩完坑之后总结出来的顺序：

1. 刷原厂 fastboot 包打底（clean all，**不要** `clean all and lock`）
2. Flash OrangeFox recovery
3. **Format Data**（解除原厂 FBE 加密，否则 recovery 读不到 `/sdcard`，只能 sideload）
4. 把 ROM、固件补丁、GApps 三个包推进 `/sdcard`
5. `twrp install` ROM
6. `twrp install` 固件补丁
7. `twrp mount /system_ext` 后 `twrp install` GApps
8. **验证 GSF 是否真的落盘**，缺了就在 recovery 里补
9. 重启，验收：`ro.product.cpu.abi`、打电话、Play 商店
10. 刷回原厂或 Lineage 官方 recovery

## 最后

两轮加起来大概六个小时，其中大半时间花在"证明问题不在 ROM 上"——查 IMS 注册、比对两套 ROM、回滚 MIUI 验证硬件。真正解决问题的那一步，是看到社区教程里一句话之后，用一条命令完成的。

值得记下来的教训只有一条：

> **跨大版本刷定制 ROM 时，"保住版本更新的固件"是错的目标。固件层要跟 ROM 配套，不是跟版本号配套。**

至于这台机器现在的状态：LineageOS 22.2、Android 15、`arm64-v8a`、通话正常、Google 全套可用、2.5GB 可用内存。新版微信和 QQ 都能装了。作为备用机，它比吃灰时有用多了。
