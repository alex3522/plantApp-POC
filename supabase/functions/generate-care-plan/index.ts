import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CARE_SCHEDULE_TOOL = {
  name: 'create_care_schedule',
  description: 'Create a personalised care schedule for this specific plant based on its conditions.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A 2-3 sentence plain-English explanation of the key care considerations for this specific plant in its environment. Be specific to the conditions provided.',
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            care_type: {
              type: 'string',
              enum: ['water', 'feed', 'mist', 'repot', 'prune'],
            },
            frequency_days: {
              type: 'integer',
              description: 'How often to repeat this task, in days.',
            },
            next_due: {
              type: 'string',
              description: 'Next due date in YYYY-MM-DD format.',
            },
          },
          required: ['care_type', 'frequency_days', 'next_due'],
        },
      },
    },
    required: ['summary', 'tasks'],
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { system, user, user_plant_id, user_id } = await req.json()

    // Check 24-hour cooldown
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: plantRow } = await supabase
      .from('user_plants')
      .select('care_plan_generated_at')
      .eq('id', user_plant_id)
      .single()

    if (plantRow?.care_plan_generated_at) {
      const lastGenerated = new Date(plantRow.care_plan_generated_at)
      const hoursSince = (Date.now() - lastGenerated.getTime()) / 3600000
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince)
        return new Response(
          JSON.stringify({ error: `Care plan was recently generated. Try again in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}.` }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Call Claude with forced tool use
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [CARE_SCHEDULE_TOOL],
        tool_choice: { type: 'tool', name: 'create_care_schedule' },
      }),
    })

    const message = await anthropicRes.json()

    if (message.error) throw new Error(message.error.message)

    const toolCall = message.content.find((c: any) => c.type === 'tool_use')
    if (!toolCall) throw new Error('No tool call in response')

    const { tasks, summary } = toolCall.input

    // Write to Supabase
    await supabase.from('care_schedule').delete().eq('user_plant_id', user_plant_id)

    const { error: insertError } = await supabase.from('care_schedule').insert(
      tasks.map((t: any) => ({
        user_plant_id,
        user_id,
        care_type: t.care_type,
        frequency_days: t.frequency_days,
        next_due: t.next_due,
      }))
    )

    if (insertError) throw new Error(insertError.message)

    await supabase.from('user_plants').update({
      care_summary: summary,
      care_plan_generated_at: new Date().toISOString(),
    }).eq('id', user_plant_id)

    return new Response(JSON.stringify({ tasks, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
