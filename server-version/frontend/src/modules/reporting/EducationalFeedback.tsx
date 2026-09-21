import React, { useState } from 'react'
import type { EducationalFeedbackContent } from './types'

export type { EducationalFeedbackContent } from './types'

const EducationalFeedback: React.FC<{ content: EducationalFeedbackContent }> = ({ content }) => {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const selected = content.choices?.find((choice) => choice.id === selectedChoice) ?? null

  return (
    <div className="space-y-5" data-testid="educational-feedback" data-content-version={content.contentVersion}>
      {content.blocks.map((block) => (
        <section key={block.id} className="rounded-lg bg-gray-50 p-4">
          {block.title && <h3 className="font-medium text-gray-800 mb-1">{block.title}</h3>}
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{block.body}</p>
        </section>
      ))}

      {content.choices && content.choices.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-800 mb-2">你可以自主选择想进一步了解的内容</h3>
          <div className="flex flex-wrap gap-2">
            {content.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="btn-secondary"
                aria-pressed={selectedChoice === choice.id}
                onClick={() => setSelectedChoice(choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>
          {selected && <p className="mt-3 rounded-lg border p-3 text-sm text-gray-700 whitespace-pre-wrap">{selected.body}</p>}
        </section>
      )}

      {content.disclaimer && <p className="text-xs text-gray-500">{content.disclaimer}</p>}
    </div>
  )
}

export default EducationalFeedback
