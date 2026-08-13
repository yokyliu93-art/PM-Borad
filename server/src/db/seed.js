import { v4 as uuid } from 'uuid';
import db from './connection.js';

export function seed() {
  const templateCount = db.prepare('SELECT COUNT(*) as count FROM template_definitions').get();
  if (templateCount.count > 0) {
    console.log('[db] Seed data exists, skipping');
    return;
  }

  console.log('[db] Seeding template definitions...');

  const insertTemplate = db.prepare(
    'INSERT INTO template_definitions (id, name, description, category, tasks_json) VALUES (?, ?, ?, ?, ?)'
  );

  const hackathon = {
    id: 'template-hackathon-001',
    name: 'Hackathon 赛事运营',
    description: '适用于 AI Hackathon / 编程比赛的全流程任务拆解',
    category: 'event',
    tasks_json: JSON.stringify([
      {
        title: '模型厂商Coding Plan对接',
        summary: '谈Token赞助方案，让厂商提供选手用的模型额度',
        cycle: '赛前2周',
        subtasks: [
          { title: '阶跃星辰Token Plan确认', note: '99元Flash Plus券 x 200张' },
          { title: 'MiniMax Token Plan确认', note: '469元/月Ultra免费7天 x 100份' },
          { title: '其他厂商Plan收集', note: '扩大厂商覆盖面' }
        ]
      },
      {
        title: '高校渠道拓展',
        summary: '覆盖10+高校AI/创业社团，铺报名信息',
        cycle: '赛前2周',
        subtasks: [
          { title: '高校AI社团名单校准', note: '' },
          { title: '报名信息分发', note: '同步社群节奏' },
          { title: '校内海报/KV铺设', note: '' }
        ]
      },
      {
        title: 'AI社区邀请',
        summary: '覆盖AI从业者社区，制定拉新推广方案',
        cycle: '赛前1周',
        subtasks: [
          { title: '社区名单确认', note: 'WayToAGI、通往AGI之路等' },
          { title: '社区联合宣发方案', note: 'Bot置顶、推文、社群转发' },
          { title: 'KOL/博主合作', note: '赛前造势' }
        ]
      },
      {
        title: '官宣物料制作',
        summary: 'KV海报、倒计时、参赛手册，全渠道物料',
        cycle: '赛前1周',
        subtasks: [
          { title: 'KV主视觉设计', note: '线上线下统一品牌调性' },
          { title: '倒计时物料', note: '3/2/1天系列海报' },
          { title: '参赛手册排版', note: '规则+时间线+FAQ' }
        ]
      },
      {
        title: '赛事产品开发',
        summary: 'Agent提交台、排行榜、裁判模块、选手后台',
        cycle: '赛前4周',
        subtasks: [
          { title: 'Agent提交台上线', note: '含环境配置和测试' },
          { title: '实时排行榜功能', note: '' },
          { title: '评审打分系统', note: '' }
        ]
      },
      {
        title: '直播联动',
        summary: '比赛日直播流、推拉流方案制定',
        cycle: '赛中1周',
        subtasks: [
          { title: '直播推拉流方案', note: '确认技术方案' },
          { title: '主持人串词', note: '全流程脚本' },
          { title: '弹幕互动规则', note: '' }
        ]
      },
      {
        title: '赛后采访与PR',
        summary: '采访整理发布、获奖团队专访',
        cycle: '赛后1周',
        subtasks: [
          { title: '获奖团队专访', note: '每人15分钟，整理关键词' },
          { title: '通稿发布', note: '机器之心、36kr等' },
          { title: '复盘文档', note: '内部复盘+对外pr' }
        ]
      }
    ])
  };

  const productLaunch = {
    id: 'template-product-001',
    name: '产品发布上线',
    description: '适用于新产品/功能的全流程发布管理',
    category: 'product',
    tasks_json: JSON.stringify([
      {
        title: '市场调研',
        summary: '竞品分析、用户需求调研、定位确认',
        cycle: '发布前4周',
        subtasks: [
          { title: '竞品分析报告', note: '' },
          { title: '用户访谈(5-10人)', note: '' },
          { title: '产品定位文档', note: '' }
        ]
      },
      {
        title: '设计评审',
        summary: '交互/视觉设计交付评审',
        cycle: '发布前3周',
        subtasks: [
          { title: '交互原型', note: '核心流程覆盖' },
          { title: '视觉设计稿', note: '含暗黑模式' },
          { title: '设计走查', note: '' }
        ]
      },
      {
        title: '开发冲刺',
        summary: '核心功能开发与联调',
        cycle: '发布前2周',
        subtasks: [
          { title: '后端API开发', note: '' },
          { title: '前端页面开发', note: '' },
          { title: '联调测试', note: '' }
        ]
      },
      {
        title: 'QA测试',
        summary: '功能测试、性能测试、回归测试',
        cycle: '发布前1周',
        subtasks: [
          { title: '功能测试用例', note: '' },
          { title: '性能压测', note: '' },
          { title: 'Bug修复验证', note: '' }
        ]
      },
      {
        title: '市场宣发',
        summary: 'PR稿、社媒预热、KOL合作',
        cycle: '发布前1周',
        subtasks: [
          { title: 'PR通稿', note: '' },
          { title: '社媒预热内容', note: '' },
          { title: '发布H5/落地页', note: '' }
        ]
      },
      {
        title: '发布执行',
        summary: '上线checklist、监控、应急预案',
        cycle: '发布日',
        subtasks: [
          { title: '上线checklist确认', note: '' },
          { title: '监控面板', note: '' },
          { title: '应急预案', note: '' }
        ]
      },
      {
        title: '发布后复盘',
        summary: '数据回顾、用户反馈收集、迭代计划',
        cycle: '发布后1周',
        subtasks: [
          { title: '数据报告', note: '' },
          { title: '用户反馈汇总', note: '' },
          { title: '下阶段迭代计划', note: '' }
        ]
      }
    ])
  };

  const contentCampaign = {
    id: 'template-content-001',
    name: '内容营销活动',
    description: '适用于内容驱动的营销活动全流程',
    category: 'marketing',
    tasks_json: JSON.stringify([
      {
        title: '选题策划',
        summary: '热点选题、排期确认、资源分配',
        cycle: '活动前3周',
        subtasks: [
          { title: '选题脑暴会', note: '' },
          { title: '选题排期表', note: '' },
          { title: '作者资源确认', note: '' }
        ]
      },
      {
        title: '内容生产',
        summary: '撰稿、设计、视频制作',
        cycle: '活动前2周',
        subtasks: [
          { title: '初稿交付', note: '' },
          { title: '配图/封面设计', note: '' },
          { title: '视频素材拍摄', note: '' }
        ]
      },
      {
        title: '审核修订',
        summary: '内部审核、合规检查、终稿确认',
        cycle: '活动前1周',
        subtasks: [
          { title: '编辑审核', note: '' },
          { title: '合规/法务审核', note: '' },
          { title: '终稿确认', note: '' }
        ]
      },
      {
        title: '渠道分发',
        summary: '多平台发布、SEO优化、社群推送',
        cycle: '活动周',
        subtasks: [
          { title: '公众号/知乎/掘金发布', note: '' },
          { title: 'SEO关键词优化', note: '' },
          { title: '社群/朋友圈推送', note: '' }
        ]
      },
      {
        title: '数据监测',
        summary: '阅读量、转化率、互动数据追踪',
        cycle: '活动周+1',
        subtasks: [
          { title: '各平台数据汇总', note: '' },
          { title: '转化漏斗分析', note: '' },
          { title: 'ROI计算', note: '' }
        ]
      },
      {
        title: '活动复盘',
        summary: '效果总结、经验沉淀、下次优化方向',
        cycle: '活动后1周',
        subtasks: [
          { title: '活动复盘报告', note: '' },
          { title: '优秀内容沉淀', note: '' },
          { title: 'SOP更新', note: '' }
        ]
      }
    ])
  };

  const blank = {
    id: 'template-blank-001',
    name: '空白模板',
    description: '从零开始手动创建所有任务',
    category: 'general',
    tasks_json: '[]'
  };

  insertTemplate.run(hackathon.id, hackathon.name, hackathon.description, hackathon.category, hackathon.tasks_json);
  insertTemplate.run(productLaunch.id, productLaunch.name, productLaunch.description, productLaunch.category, productLaunch.tasks_json);
  insertTemplate.run(contentCampaign.id, contentCampaign.name, contentCampaign.description, contentCampaign.category, contentCampaign.tasks_json);
  insertTemplate.run(blank.id, blank.name, blank.description, blank.category, blank.tasks_json);

  console.log('[db] Seeded 4 templates');
}
